import Anthropic from "@anthropic-ai/sdk";
import { wellFormed } from "./format";
import { Channel, ChannelCoverage, PeriodDigest, Post, SourceRef, TopicDigest } from "./types";

/**
 * Turning a window of posts into a topic-organised digest.
 *
 * The job that matters here is collapsing repetition: the same event reported by
 * five channels has to become one topic with five sources, not five topics. That
 * is a judgement about meaning rather than wording — two channels can describe
 * one event without sharing a single content word — so it is done by the model.
 *
 * Without credentials there is a lexical fallback further down. It groups by
 * shared vocabulary, which catches near-identical reposts and misses paraphrase;
 * digests it produces are marked `degraded` so answers can admit the limit
 * rather than overstate what was merged.
 */

/** Opus by default; `ANTHROPIC_MODEL` lets the person paying choose otherwise. */
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

function haveCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const DIGEST_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "One sentence covering the whole period, in the language the posts are written in.",
    },
    topics: {
      type: "array",
      description:
        "One entry per distinct story. Posts describing the same event belong to ONE topic, however " +
        "differently they are worded. Order by how much attention the story deserves.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "A short, concrete name for the story." },
          summary: {
            type: "string",
            description:
              "What happened, merged across every source that covered it. Two to four sentences. " +
              "Where sources disagree, say so rather than picking one.",
          },
          points: {
            type: "array",
            description: "Details worth listing separately. Empty when the summary says it all.",
            items: { type: "string" },
          },
          postIds: {
            type: "array",
            description: "The id of every post that belongs to this topic, exactly as given.",
            items: { type: "string" },
          },
        },
        required: ["title", "summary", "points", "postIds"],
        additionalProperties: false,
      },
    },
  },
  required: ["headline", "topics"],
  additionalProperties: false,
} as const;

const SYSTEM = `You read a period of posts from the Telegram channels one person follows, and produce a digest.

The reason this digest exists is that channels repeat each other. Your first duty is to collapse that
repetition: when several posts describe the same event, they form ONE topic that cites all of them.
Judge by what happened, not by shared wording — two channels can report one event with no words in
common, and two posts can share vocabulary while describing unrelated things.

Write in the language the posts are written in. Be concrete: name what happened rather than
characterising it. Do not add facts that are not in the posts, and do not smooth over disagreement
between sources — a digest that hides a contradiction is worse than one that reports it.

Leave out posts that carry no news: advertising, giveaways, engagement bait, pure self-promotion.`;

/**
 * The subjects asked for, when there are any.
 *
 * The channels reaching this point are already filtered, but being on subject
 * is a property of a channel rather than of every post it publishes — so the
 * last cut happens here. It costs nothing: these posts have been read either
 * way, and this only decides what gets written about.
 */
function subjectRule(subjects: string[]): string {
  return subjects.length === 0
    ? ""
    : `\n\nThis person reads for: ${subjects.join(", ")}. Cover only what bears on those subjects, and leave ` +
        `the rest out however prominent it was. If nothing in the window bears on them, say exactly that ` +
        `rather than filling the digest with the next most interesting thing.`;
}

/** A story already told, carried forward so the next digest does not tell it again. */
export interface PriorTopic {
  title: string;
  summary: string;
}

/**
 * What earlier digests already reported, when the caller has any.
 *
 * The summariser collapses repetition within one window; this extends that
 * duty across windows. Whether a post "merely repeats" an earlier story is a
 * judgement about meaning — the same event arrives from a new channel with no
 * shared wording — so it is made here, by the model, not by matching words.
 *
 * The cut it makes is editorial, not a loss: a post omitted as a repeat is
 * covered the same way an omitted advertisement is (the digest considered it),
 * and the story itself remains readable in the earlier digest it came from.
 */
function priorRule(prior: PriorTopic[]): string {
  if (prior.length === 0) return "";
  // Sanitised here, not only at the source: digests stored before this fix
  // may already carry half-emoji from the lexical fallback's slices.
  const told = wellFormed(prior.map((t) => `• ${t.title} — ${t.summary}`).join("\n"));
  return (
    `\n\nThe person has already read these stories in their previous digests:\n${told}\n\n` +
    `A post that merely repeats one of them — the same event, however differently worded, from however ` +
    `many new channels — must not appear in this digest at all. A post that materially develops one of ` +
    `them (a consequence, a reversal, a significant new fact) belongs in the digest as a brief update: ` +
    `open its title with "Update:" (in the digest's language), state what changed, and do not re-tell ` +
    `the story from the beginning. If nothing in the window is new beyond these stories, produce no ` +
    `topics and let the headline say exactly that.`
  );
}

/** A long post's opening states what happened; the rest is elaboration. */
const MAX_POST_CHARS = 1000;
/** Roughly 120k tokens of posts — balance speed vs context. */
const MAX_TOTAL_CHARS = 450_000;

/**
 * Trim a window to something a single request can hold.
 *
 * The collector bounds posts by count, which says nothing about size: six
 * hundred posts at Telegram's 4096-character maximum would be far past any
 * context. Long posts lose their tail, and if that is still too much the oldest
 * posts go — the digest is about what is new, so the recent end is the part
 * worth keeping.
 */
function fit(posts: Post[]): Post[] {
  const trimmed = posts.map((post) =>
    post.text.length <= MAX_POST_CHARS
      ? post
      : { ...post, text: `${wellFormed(post.text.slice(0, MAX_POST_CHARS))}…` }
  );

  let total = trimmed.reduce((sum, p) => sum + p.text.length, 0);
  if (total <= MAX_TOTAL_CHARS) return trimmed;

  const kept = [...trimmed];
  while (kept.length > 1 && total > MAX_TOTAL_CHARS) {
    total -= kept[0].text.length;
    kept.shift(); // posts arrive oldest-first
  }
  return kept;
}

/**
 * How far each channel got, measured on the posts that survived `fit`.
 *
 * Deliberately not measured on what the collector fetched. Posts trimmed to fit
 * the context were read and then discarded unsummarised, and counting them as
 * covered would advance the channel's mark past material no digest ever
 * mentioned — losing it silently, which is the failure this record exists to
 * prevent.
 */
function coverageOf(posts: Post[]): ChannelCoverage[] {
  const highest = new Map<string, number>();
  for (const post of posts) {
    const seen = highest.get(post.channelId);
    if (seen === undefined || post.messageId > seen) highest.set(post.channelId, post.messageId);
  }
  return [...highest].map(([channelId, maxMessageId]) => ({ channelId, maxMessageId }));
}

/** Posts as the model sees them: grouped by channel, each line addressable by id. */
function render(posts: Post[]): string {
  const byChannel = new Map<string, Post[]>();
  for (const post of posts) {
    if (!byChannel.has(post.channelTitle)) byChannel.set(post.channelTitle, []);
    byChannel.get(post.channelTitle)!.push(post);
  }

  const sections: string[] = [];
  for (const [title, channelPosts] of byChannel) {
    const lines = channelPosts.map(
      (p) => `[${p.id}] ${new Date(p.date).toISOString().slice(11, 16)} ${p.text.replace(/\s+/g, " ").trim()}`
    );
    sections.push(`## ${title}\n${lines.join("\n")}`);
  }
  return sections.join("\n\n");
}

function sourceRefs(postIds: string[], byId: Map<string, Post>, channels: Map<string, Channel>): SourceRef[] {
  const refs: SourceRef[] = [];
  const seen = new Set<string>();
  for (const id of postIds) {
    const post = byId.get(id);
    if (!post || seen.has(id)) continue;
    seen.add(id);
    const channel = channels.get(post.channelId);
    refs.push({
      channelId: post.channelId,
      channelTitle: post.channelTitle,
      messageId: post.messageId,
      link: channel?.username ? `https://t.me/${channel.username}/${post.messageId}` : undefined,
    });
  }
  return refs;
}

export async function summarisePeriod(
  userId: string,
  allPosts: Post[],
  channels: Channel[],
  from: Date,
  to: Date,
  subjects: string[] = [],
  prior: PriorTopic[] = []
): Promise<PeriodDigest> {
  // `postCount` below counts what was read, not what survived the trim, so the
  // digest still reports the true size of the window.
  const posts = fit(allPosts);

  const base = {
    id: `${userId}:${from.toISOString()}`,
    userId,
    from: from.toISOString(),
    to: to.toISOString(),
    createdAt: new Date().toISOString(),
    postCount: allPosts.length,
    channelCount: new Set(allPosts.map((p) => p.channelId)).size,
    coverage: coverageOf(posts),
  };

  if (posts.length === 0) {
    return { ...base, headline: "No new posts in this period.", topics: [] };
  }

  const byId = new Map(posts.map((p) => [p.id, p]));
  const channelIndex = new Map(channels.map((c) => [c.id, c]));

  if (!haveCredentials()) {
    return { ...base, ...groupLexically(posts, byId, channelIndex), degraded: true };
  }

  try {
    const response: any = await (anthropic().beta.messages.create as any)({
      model: MODEL,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: `${SYSTEM}${subjectRule(subjects)}${priorRule(prior)}`,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: DIGEST_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content:
            `Posts from ${from.toISOString()} to ${to.toISOString()}.\n\n${render(posts)}`,
        },
      ],
    });

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return { ...base, ...groupLexically(posts, byId, channelIndex), degraded: true };
    }

    const text = response.content.find((b: any) => b.type === "text")?.text || "";
    const parsed = JSON.parse(text) as { headline: string; topics: any[] };

    const topics: TopicDigest[] = parsed.topics.map((t) => ({
      title: t.title,
      summary: t.summary,
      points: Array.isArray(t.points) ? t.points : [],
      sources: sourceRefs(Array.isArray(t.postIds) ? t.postIds : [], byId, channelIndex),
    }));

    return { ...base, headline: parsed.headline, topics };
  } catch (err: any) {
    if (err instanceof Anthropic.AuthenticationError || /authentication method/i.test(err.message)) {
      return { ...base, ...groupLexically(posts, byId, channelIndex), degraded: true };
    }
    throw err;
  }
}

/* ------------------------------ no-model path ----------------------------- */

const STOPWORDS = new Set(
  ("the and for that with from this have has was were are you your not but all can will just about " +
    "и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне " +
    "было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до").split(/\s+/)
);

function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

/**
 * Vocabulary-based grouping, used only when no model is reachable. It merges
 * posts that share most of their distinctive words, which covers verbatim
 * reposts and little else — hence `degraded` on anything it produces.
 */
function groupLexically(
  posts: Post[],
  byId: Map<string, Post>,
  channels: Map<string, Channel>
): { headline: string; topics: TopicDigest[] } {
  const clusters: { words: Set<string>; posts: Post[] }[] = [];

  for (const post of posts) {
    const words = keywords(post.text);
    const hit = clusters.find((c) => overlap(c.words, words) >= 0.5);
    if (hit) {
      hit.posts.push(post);
      for (const w of words) hit.words.add(w);
    } else {
      clusters.push({ words, posts: [post] });
    }
  }

  clusters.sort((a, b) => b.posts.length - a.posts.length);

  const topics: TopicDigest[] = clusters.slice(0, 25).map((cluster) => {
    const first = cluster.posts[0];
    const sentence = first.text.replace(/\s+/g, " ").trim();
    const title = wellFormed(sentence.slice(0, 60)) + (sentence.length > 60 ? "…" : "");
    const covering = new Set(cluster.posts.map((p) => p.channelTitle));
    return {
      title,
      summary:
        cluster.posts.length > 1
          ? `${cluster.posts.length} posts across ${covering.size} channel(s) with closely matching wording. First: “${wellFormed(sentence.slice(0, 300))}”`
          : wellFormed(sentence.slice(0, 400)),
      points: [],
      sources: sourceRefs(cluster.posts.map((p) => p.id), byId, channels),
    };
  });

  const channelCount = new Set(posts.map((p) => p.channelId)).size;
  return {
    headline:
      `${posts.length} posts across ${channelCount} channels, grouped by wording rather than meaning ` +
      `— no summarising model is configured, so related stories phrased differently were not merged.`,
    topics,
  };
}
