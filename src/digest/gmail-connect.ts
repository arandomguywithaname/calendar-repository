import express from "express";
import { google } from "googleapis";
import { GMAIL_SCOPE } from "../reader/connectors/gmail";
import { consumeState, issueState, peekState, publicBaseUrl, resultPage } from "./oauth-state";
import { setConnections } from "./store";

/**
 * "Connect Gmail" — the same shape as Slack, because Google has no other one.
 *
 * There is no token to paste here at all: Gmail is OAuth or nothing. The link
 * opens Google's own consent screen, the person picks their account and sees
 * exactly what is being asked for, and what comes back is a refresh token
 * stored against their Telegram id.
 *
 * The scope is `gmail.readonly` and nothing else — the app can read mail and
 * is incapable of sending, deleting or modifying any of it. That is worth
 * saying out loud on the consent screen, because "let a bot into my email" is
 * a bigger ask than any other connection here.
 */

function redirectUri(): string {
  return `${publicBaseUrl()}/gmail/callback`;
}

export function gmailOauthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri()
  );
}

export function connectUrl(userId: string): string {
  return `${publicBaseUrl()}/gmail/start/${issueState(userId, "gmail")}`;
}

export function mountGmailOauth(app: express.Express): void {
  app.get("/gmail/start/:state", (req, res) => {
    const state = String(req.params.state || "");
    if (!peekState(state, "gmail")) {
      res.status(400).send(resultPage("That link expired", "Send /gmail to the bot again for a fresh one."));
      return;
    }
    // `offline` + `consent` together are what actually yield a refresh token:
    // without them Google returns only an access token good for an hour, and
    // the connection would quietly die the same afternoon.
    res.redirect(
      client().generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [GMAIL_SCOPE],
        state,
      })
    );
  });

  app.get("/gmail/callback", async (req, res) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error || !code || !state) {
      res.status(400).send(resultPage("Gmail sign-in was cancelled", "Nothing was connected. /gmail starts it again."));
      return;
    }

    const userId = consumeState(state, "gmail");
    if (!userId) {
      res.status(400).send(resultPage("That link expired", "Send /gmail to the bot again for a fresh one."));
      return;
    }

    try {
      const auth = client();
      const { tokens } = await auth.getToken(code);
      if (!tokens.refresh_token) {
        // Google withholds it when the account has consented before and the
        // prompt was skipped. Revoking at myaccount.google.com and retrying is
        // the only cure, so say that rather than storing a token that expires.
        throw new Error("no refresh token returned");
      }
      auth.setCredentials(tokens);

      let email: string | undefined;
      try {
        const profile = await google.gmail({ version: "v1", auth }).users.getProfile({ userId: "me" });
        email = profile.data.emailAddress || undefined;
      } catch {
        /* the address is a nicety; the connection works without knowing it */
      }

      await setConnections(userId, { googleRefreshToken: tokens.refresh_token, googleEmail: email });
      announce(userId, email);
      res.send(
        resultPage(
          "Gmail connected",
          `${email ? `<b>${email}</b> is ` : ""}now part of your digests, read-only. You can close this tab and go back to Telegram.`
        )
      );
    } catch (err: any) {
      const missing = /no refresh token/.test(err?.message || "");
      console.warn(`gmail oauth failed for ${userId}: ${err?.message || err}`);
      res.status(400).send(
        resultPage(
          "Gmail sign-in failed",
          missing
            ? "Google didn't return a lasting permission. Remove this app at myaccount.google.com → Data & privacy → Third-party access, then send /gmail again."
            : "Nothing was connected. Send /gmail to the bot to try again."
        )
      );
    }
  });
}

let announce: (userId: string, email?: string) => void = () => {};

export function setGmailNotifier(fn: (userId: string, email?: string) => void): void {
  announce = fn;
}
