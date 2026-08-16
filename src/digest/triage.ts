import Anthropic from "@anthropic-ai/sdk";
import { sampleChannels } from "./collector";
import { wellFormed } from "./format";
import { Channel, ChannelVerdict, TelegramAccount } from "./types";

/**
 * Deciding which channels are worth reading at all.
 *
 * The digest pipeline is bounded by how many channels it opens, so the cheapest
 * post is the one never fetched. This is where that saving is bought: each
 * channel is judged once, on a five-post sample, and the answer is reused until
 * the subjects change. A run that skips forty channels costs one `getDialogs`
 * and nothing else.
 *
 * It is deliberately a judgement about the *channel*, not about posts. Deciding
 * per post would have to happen on every run and would cost more than it saved;
 * deciding per channel happens once and gets cheaper the longer it stands.
 *
 * Subject matter cannot be matched lexically — "AI" has to catch posts about
 * inference and model releases that never use the word — so this needs a model
 * or it needs to not happen. Without credentials, nothing is filtered.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function canTriage(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    channels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "The id exactly as given." },
          onTopic: {
            type: "boolean",
            description: "True when this channel regularly covers at least one of the subjects.",
          },
          reason: {
            type: "string",
            description:
              "One short clause naming what the channel is actually about, in the language of the subjects. " +
              "This is shown to the person, who may disagree with it.",
          },
        },
        required: ["channelId", "onTopic", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["channels"],
  additionalProperties: false,
} as const;

const SYSTEM = `You are deciding which Telegram channels a person should keep reading, given the subjects they
asked for. For each channel you get its name and a few recent posts — enough to tell what it publishes.

Judge what the channel is regularly about, not whether one sampled post happens to mention a subject. A
general news channel that covered an AI story once is not an AI channel. A channel that covers a subject
constantly qualifies even if the particular posts you were shown are unremarkable.

When you genuinely cannot tell, include it. The two mistakes are not equal: a channel wrongly included
costs one digest of noise and can then be judged on better evidence, while a channel wrongly excluded
produces no evidence of itself at all and the person never learns what they stopped seeing.

Give each reason as a short clause naming what the channel publishes. The person reads these and overrules
you when you are wrong, so "mostly football results" is useful and "not relevant" is not.`;

export interface TriageOutcome {
  verdicts: Record<string, ChannelVerdict>;
  channels: Channel[];
  /** Set when every channel came back off-subject, which is never a usable answer. */
  everythingExcluded: boolean;
}

function render(sampled: { channel: Channel; samples: string[] }[]): string {
  return sampled
    .map(({ channel, samples }) => {
      const posts = samples.length
        ? samples.map((s) => `  - ${s}`).join("\n")
        : "  (no recent text posts)";
      return `### ${channel.title} [id: ${channel.id}]\n${posts}`;
    })
    .join("\n\n");
}

export async function triage(
  account: TelegramAccount,
  topics: string[],
  options: { only?: Set<string> } = {}
): Promise<TriageOutcome> {
  const sampled = await sampleChannels(account, { only: options.only });
  if (sampled.length === 0) {
    return { verdicts: {}, channels: [], everythingExcluded: false };
  }

  const channels = sampled.map((s) => s.channel);

  const response: any = await (anthropic().beta.messages.create as any)({
    model: MODEL,
    max_tokens: 8000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: SYSTEM,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: VERDICT_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Subjects: ${topics.join(", ")}\n\n${render(sampled)}`,
      },
    ],
  });

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    throw new Error("The model couldn't get through the channel list in one go.");
  }

  const text = response.content.find((b: any) => b.type === "text")?.text || "";
  const parsed = JSON.parse(text) as { channels: { channelId: string; onTopic: boolean; reason: string }[] };

  const decidedAt = new Date().toISOString();
  const known = new Set(channels.map((c) => c.id));
  const verdicts: Record<string, ChannelVerdict> = {};

  for (const entry of parsed.channels) {
    // An id the model invented would silently filter a channel that does not
    // exist, or worse, one that does under a mangled id.
    if (!known.has(entry.channelId)) continue;
    verdicts[entry.channelId] = {
      onTopic: Boolean(entry.onTopic),
      reason: wellFormed(String(entry.reason || "").slice(0, 200)),
      decidedAt,
    };
  }

  const judged = Object.values(verdicts);
  return {
    verdicts,
    channels,
    // Only meaningful when the whole list was judged: that is the case where
    // excluding everything leaves a bot which reads nothing and cannot say why,
    // and the caller is expected to refuse it. Re-examining a set of channels
    // that were already off-subject is expected to leave them off-subject, and
    // refusing to store that would re-examine them on every run forever.
    everythingExcluded: !options.only && judged.length > 0 && judged.every((v) => !v.onTopic),
  };
}
