import { Page } from "./types";

/**
 * robots.txt, honoured rather than cited.
 *
 * A mandate that says "respectsRobotsTxt: true" is worth nothing unless
 * something checks. This is that something. It is also the cheapest possible
 * good-faith signal: the file is the site telling you, in writing and in
 * advance, where automated traffic is welcome. Ignoring it while presenting a
 * signed identity would be a strange thing to do — you would be signing your
 * name to the violation.
 *
 * Parsing follows the usual rules: group directives by User-agent, pick the
 * most specific group that matches our token (falling back to `*`), then the
 * longest matching path rule wins and Allow beats Disallow on a tie.
 */

export interface RobotsRule {
  allow: boolean;
  /** The raw path pattern, `*` and `$` included. */
  pattern: string;
}

export interface RobotsPolicy {
  rules: RobotsRule[];
  crawlDelaySeconds?: number;
  /** The User-agent group these rules came from, for explaining a refusal. */
  matchedGroup: string;
}

/** Turn a robots.txt pattern into an anchored regular expression. */
function patternToRegExp(pattern: string): RegExp {
  let source = "";
  for (const ch of pattern) {
    if (ch === "*") source += ".*";
    else if (ch === "$") source += "$";
    else source += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp("^" + source);
}

/**
 * Parse robots.txt and return the rules that apply to `token`.
 * An unreachable or unparseable file is the caller's problem, not this one's —
 * it only ever sees text.
 */
export function parseRobots(text: string, token: string): RobotsPolicy {
  const wanted = token.toLowerCase();
  const groups = new Map<string, { rules: RobotsRule[]; crawlDelay?: number }>();
  let currentAgents: string[] = [];
  let lastLineWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      // Consecutive User-agent lines share one group of rules.
      if (!lastLineWasAgent) currentAgents = [];
      currentAgents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;
    if (!currentAgents.length) continue;

    for (const agent of currentAgents) {
      let group = groups.get(agent);
      if (!group) {
        group = { rules: [] };
        groups.set(agent, group);
      }
      if (field === "disallow") group.rules.push({ allow: false, pattern: value });
      else if (field === "allow") group.rules.push({ allow: true, pattern: value });
      else if (field === "crawl-delay") {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) group.crawlDelay = n;
      }
    }
  }

  // Most specific matching group wins; `*` is the fallback.
  let best: string | undefined;
  for (const agent of groups.keys()) {
    if (agent === "*") continue;
    if (wanted === agent || wanted.startsWith(agent)) {
      if (best === undefined || agent.length > best.length) best = agent;
    }
  }
  const matched = best ?? (groups.has("*") ? "*" : undefined);
  if (matched === undefined) return { rules: [], matchedGroup: "(none)" };
  const group = groups.get(matched)!;
  return { rules: group.rules, crawlDelaySeconds: group.crawlDelay, matchedGroup: matched };
}

export interface RobotsDecision {
  allowed: boolean;
  /** The rule that decided it, for an honest explanation. */
  rule?: string;
  matchedGroup: string;
}

/** Longest matching pattern wins; Allow beats Disallow at equal length. */
export function isPathAllowed(policy: RobotsPolicy, pathWithQuery: string): RobotsDecision {
  let winner: RobotsRule | undefined;
  let winnerLength = -1;
  for (const rule of policy.rules) {
    // An empty Disallow means "nothing is disallowed" and never matches.
    if (rule.pattern === "") continue;
    if (!patternToRegExp(rule.pattern).test(pathWithQuery)) continue;
    const length = rule.pattern.length;
    if (length > winnerLength || (length === winnerLength && rule.allow)) {
      winner = rule;
      winnerLength = length;
    }
  }
  if (!winner) return { allowed: true, matchedGroup: policy.matchedGroup };
  return {
    allowed: winner.allow,
    rule: `${winner.allow ? "Allow" : "Disallow"}: ${winner.pattern}`,
    matchedGroup: policy.matchedGroup,
  };
}

const cache = new Map<string, { policy: RobotsPolicy | null; fetchedAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Fetch robots.txt through the browser, so it travels with the same cookies,
 * IP and declared identity as the pages it governs. A missing file (404) means
 * no restrictions; a fetch that fails for any other reason returns null, and
 * the caller decides — this module never invents a permission it did not read.
 */
export async function fetchRobots(page: Page, url: string, token: string): Promise<RobotsPolicy | null> {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return null;
  }
  const hit = cache.get(origin);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.policy;

  let policy: RobotsPolicy | null = null;
  try {
    const response = await page.context().request.get(`${origin}/robots.txt`, { timeout: 10000 });
    if (response.status() === 404 || response.status() === 410) {
      policy = { rules: [], matchedGroup: "(no robots.txt)" };
    } else if (response.ok()) {
      policy = parseRobots(await response.text(), token);
    }
  } catch {
    policy = null;
  }
  cache.set(origin, { policy, fetchedAt: Date.now() });
  return policy;
}

/** Forget everything cached — used by the tests and by browser_close. */
export function clearRobotsCache(): void {
  cache.clear();
}

/** Is robots.txt enforced? On by default; the mandate says so in writing. */
export function robotsEnforced(): boolean {
  return process.env.AGENT_RESPECT_ROBOTS !== "false";
}
