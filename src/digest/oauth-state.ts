import * as crypto from "crypto";

/**
 * The bit every "connect an app" flow needs and none of them should own.
 *
 * A person taps a link in Telegram and comes back in a browser, and the
 * browser carries no proof of who they are — there is no session cookie on
 * their phone that says "this is Telegram user 123". So the identity has to
 * ride in the one thing that survives the round trip: the `state` parameter.
 *
 * Held in memory rather than in the store, deliberately. These live for
 * minutes, a restart mid-sign-in is recoverable by tapping the link again,
 * and a half-finished authorisation is not something worth persisting.
 */

const TTL_MS = 15 * 60 * 1000;

const pending = new Map<string, { userId: string; provider: string; at: number }>();

function sweep(): void {
  const now = Date.now();
  for (const [state, entry] of pending) {
    if (now - entry.at > TTL_MS) pending.delete(state);
  }
}

export function issueState(userId: string, provider: string): string {
  sweep();
  const state = crypto.randomBytes(24).toString("base64url");
  pending.set(state, { userId, provider, at: Date.now() });
  return state;
}

export function peekState(state: string, provider: string): string | undefined {
  sweep();
  const entry = pending.get(state);
  return entry && entry.provider === provider ? entry.userId : undefined;
}

/**
 * Read it and burn it. A state is one authorisation: replaying a callback
 * must not be able to attach a second account to somebody's profile.
 */
export function consumeState(state: string, provider: string): string | undefined {
  const userId = peekState(state, provider);
  if (userId !== undefined) pending.delete(state);
  return userId;
}

export function publicBaseUrl(): string {
  return (
    process.env.MCP_PUBLIC_URL ||
    (process.env.FLY_APP_NAME
      ? `https://${process.env.FLY_APP_NAME}.fly.dev`
      : `http://localhost:${process.env.PORT || 8080}`)
  ).replace(/\/+$/, "");
}

/** The page someone lands on after pressing Allow — or after it went wrong. */
export function resultPage(title: string, body: string): string {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100dvh;padding:2rem;background:#0f1115;color:#e9edf2}
main{max-width:32rem;text-align:center}h1{font-size:1.3rem;margin:0 0 .75rem}p{margin:0;color:#a8b3c2}</style>
<main><h1>${title}</h1><p>${body}</p></main>`;
}
