import * as crypto from "crypto";
import express from "express";
import { setConnections } from "./store";

/**
 * "Connect Slack" as a login, not as a pasted token.
 *
 * A token *is* the product of an authorisation — but the way to obtain an
 * `xoxp-` by hand is to create a Slack app, add scopes, and install it, which
 * is a developer's afternoon, not something to ask a subscriber for. The real
 * flow is the one every other product uses: a link, Slack's own consent
 * screen, a redirect back here with a code, and a token exchanged behind the
 * scenes. The person's only step is pressing Allow in Slack.
 *
 * The web dashboard already did this for its own logged-in users. This is the
 * same exchange keyed to a Telegram id instead of a browser session, which is
 * why the state has to carry the identity: there is no cookie on the person's
 * phone that says who they are when Slack sends them back.
 */

const SCOPES = [
  "channels:read", "groups:read", "im:read", "mpim:read",
  "channels:history", "groups:history", "im:history", "mpim:history",
  "users:read",
].join(",");

/** Long enough to walk to a laptop, short enough that a leaked link is stale. */
const STATE_TTL_MS = 15 * 60 * 1000;

/** state -> the Telegram user who asked. In memory: one process, and expiry is the point. */
const pending = new Map<string, { userId: string; at: number }>();

export function slackOauthConfigured(): boolean {
  return Boolean(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET);
}

function baseUrl(): string {
  return (
    process.env.MCP_PUBLIC_URL ||
    (process.env.FLY_APP_NAME ? `https://${process.env.FLY_APP_NAME}.fly.dev` : `http://localhost:${process.env.PORT || 8080}`)
  ).replace(/\/+$/, "");
}

function redirectUri(): string {
  return `${baseUrl()}/slack/callback`;
}

function sweep(): void {
  const now = Date.now();
  for (const [state, entry] of pending) {
    if (now - entry.at > STATE_TTL_MS) pending.delete(state);
  }
}

/**
 * The link handed to one person. It points at us rather than straight at
 * Slack so the authorize URL — client id, scopes, redirect — is built at the
 * moment of the click, and the message in Telegram stays short enough to tap.
 */
export function connectUrl(userId: string): string {
  sweep();
  const state = crypto.randomBytes(24).toString("base64url");
  pending.set(state, { userId, at: Date.now() });
  return `${baseUrl()}/slack/start/${state}`;
}

function page(title: string, body: string): string {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100dvh;padding:2rem;background:#0f1115;color:#e9edf2}
main{max-width:32rem;text-align:center}h1{font-size:1.3rem;margin:0 0 .75rem}p{margin:0;color:#a8b3c2}</style>
<main><h1>${title}</h1><p>${body}</p></main>`;
}

/** Both halves of the dance, mounted on the server the bot already runs. */
export function mountSlackOauth(app: express.Express): void {
  app.get("/slack/start/:state", (req, res) => {
    sweep();
    const state = String(req.params.state || "");
    if (!pending.has(state)) {
      res.status(400).send(page("That link expired", "Send /slack to the bot again for a fresh one."));
      return;
    }
    const url = new URL("https://slack.com/oauth/v2/authorize");
    url.searchParams.set("client_id", process.env.SLACK_CLIENT_ID || "");
    url.searchParams.set("user_scope", SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("redirect_uri", redirectUri());
    res.redirect(url.toString());
  });

  app.get("/slack/callback", async (req, res) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error || !code || !state) {
      res.status(400).send(page("Slack sign-in was cancelled", "Nothing was connected. /slack starts it again."));
      return;
    }

    sweep();
    // Consumed on sight: a state is one authorisation, and replaying a
    // callback must not attach a second workspace to somebody's account.
    const claim = pending.get(state);
    pending.delete(state);
    if (!claim) {
      res.status(400).send(page("That link expired", "Send /slack to the bot again for a fresh one."));
      return;
    }

    try {
      const body = new URLSearchParams({
        code,
        client_id: process.env.SLACK_CLIENT_ID || "",
        client_secret: process.env.SLACK_CLIENT_SECRET || "",
        redirect_uri: redirectUri(),
      });
      const response = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      const payload: any = await response.json();
      if (!payload.ok) throw new Error(payload.error || "slack_oauth_failed");

      // The user token reads what that person can see; the bot token would
      // only see channels the app was invited to, which is not their inbox.
      const token = payload.authed_user?.access_token || payload.access_token;
      if (!token) throw new Error("Slack returned no usable token.");

      await setConnections(claim.userId, {
        slackToken: token,
        slackTeam: payload.team?.name || undefined,
      });
      notifyConnected(claim.userId, payload.team?.name);
      res.send(
        page(
          "Slack connected",
          `${payload.team?.name ? `<b>${payload.team.name}</b> is ` : ""}now part of your digests. You can close this tab and go back to Telegram.`
        )
      );
    } catch (err: any) {
      console.warn(`slack oauth failed for ${claim.userId}: ${err?.message || err}`);
      res.status(400).send(page("Slack sign-in failed", "Nothing was connected. Send /slack to the bot to try again."));
    }
  });
}

/**
 * The browser tab and the Telegram chat are different places; the person
 * finished in one and is waiting in the other. The bot registers this at
 * startup for the same reason billing does — this module must not import it.
 */
let announce: (userId: string, team?: string) => void = () => {};

export function setSlackNotifier(fn: (userId: string, team?: string) => void): void {
  announce = fn;
}

function notifyConnected(userId: string, team?: string): void {
  try {
    announce(userId, team);
  } catch {
    /* the page already said it worked; a missed Telegram line is not a failure */
  }
}
