import * as crypto from "crypto";
import express from "express";
import { linkStripeCustomer, setSuspension, userForStripeCustomer } from "./store";

/**
 * Stripe, reduced to the one thing this bot needs from it: flipping the
 * suspension switch automatically.
 *
 * The money never passes through here. The operator makes a subscription
 * Payment Link in the Stripe dashboard; /pay hands it to a client with their
 * Telegram id riding along as client_reference_id; Stripe charges the card
 * and pays out to the operator's bank on its own schedule. What arrives here
 * is only the *news* — a checkout completed, an invoice failed, a
 * subscription died — and each item of news maps to the switch the admin
 * could already flip by hand.
 *
 * No Stripe SDK: the webhook is one HMAC check and a JSON body, and the
 * bundle stays free of a dependency it would use five lines of.
 */

export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_PAYMENT_LINK && process.env.STRIPE_WEBHOOK_SECRET);
}

/** The client's personal checkout URL: the Payment Link plus their identity. */
export function paymentLinkFor(userId: string): string {
  const base = (process.env.STRIPE_PAYMENT_LINK || "").replace(/\/+$/, "");
  return `${base}?client_reference_id=${encodeURIComponent(userId)}`;
}

/**
 * What the webhook decided, handed to whoever can talk to people.
 *
 * Billing cannot import the bot — the bot imports billing for /pay, and a
 * cycle helps nobody — so the bot registers a notifier at startup instead.
 */
export interface BillingEvent {
  userId: string;
  kind: "activated" | "suspended";
  /** One human sentence for the admin's log message. */
  reason: string;
}

let notify: (event: BillingEvent) => Promise<void> = async () => {};

export function setBillingNotifier(fn: (event: BillingEvent) => Promise<void>): void {
  notify = fn;
}

/**
 * Stripe's signature scheme: `t=<unix>,v1=<hmac>` over `${t}.${body}`.
 * Verified by hand — it is one HMAC — with the usual five-minute tolerance
 * so a replayed capture goes stale.
 */
function verifySignature(payload: Buffer, header: string, secret: string): boolean {
  const timestamp = header
    .split(",")
    .map((kv) => kv.split("="))
    .find(([k]) => k === "t")?.[1];
  const signatures = header
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .map((kv) => kv.slice(3));
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload.toString("utf8")}`)
    .digest("hex");
  return signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

/**
 * The webhook. Mounted with a raw body — the signature covers exact bytes,
 * and a JSON round-trip would quietly re-order them into never verifying.
 *
 * Unknown event types answer 200 on purpose: Stripe retries anything else,
 * and "I heard you and have nothing to do" is a success, not a failure.
 */
export async function handleStripeWebhook(req: express.Request, res: express.Response): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!secret) {
    res.status(503).send("billing not configured");
    return;
  }

  const payload = req.body as Buffer;
  const signature = String(req.headers["stripe-signature"] || "");
  if (!Buffer.isBuffer(payload) || !verifySignature(payload, signature, secret)) {
    res.status(400).send("bad signature");
    return;
  }

  let event: any;
  try {
    event = JSON.parse(payload.toString("utf8"));
  } catch {
    res.status(400).send("bad payload");
    return;
  }

  // Acknowledge before the slow work: Stripe times webhooks out at ~10s, and
  // everything below can involve Telegram round-trips.
  res.status(200).send("ok");

  try {
    const object = event?.data?.object || {};
    switch (event?.type) {
      case "checkout.session.completed": {
        // The one moment the Telegram id and the Stripe customer are in the
        // same place. client_reference_id is what /pay put in the link.
        const userId = String(object.client_reference_id || "").trim();
        const customerId = String(object.customer || "").trim();
        if (!userId) {
          console.warn("stripe: checkout completed without client_reference_id — cannot map to a user");
          return;
        }
        if (customerId) await linkStripeCustomer(customerId, userId);
        if (await setSuspension(userId, false)) {
          await notify({ userId, kind: "activated", reason: "checkout completed — subscription started" });
        } else {
          await notify({ userId, kind: "activated", reason: "checkout completed (account was already active)" });
        }
        return;
      }
      case "invoice.paid": {
        // Recovery after a failed charge, or just the monthly renewal.
        const userId = await userForStripeCustomer(String(object.customer || ""));
        if (userId && (await setSuspension(userId, false))) {
          await notify({ userId, kind: "activated", reason: "invoice paid — subscription recovered" });
        }
        return;
      }
      case "invoice.payment_failed": {
        const userId = await userForStripeCustomer(String(object.customer || ""));
        if (userId && (await setSuspension(userId, true))) {
          await notify({ userId, kind: "suspended", reason: "payment failed" });
        }
        return;
      }
      case "customer.subscription.deleted": {
        const userId = await userForStripeCustomer(String(object.customer || ""));
        if (userId && (await setSuspension(userId, true))) {
          await notify({ userId, kind: "suspended", reason: "subscription cancelled" });
        }
        return;
      }
      default:
        return; // heard, nothing to do
    }
  } catch (err: any) {
    // The 200 already went out; this is ours to log, not Stripe's to retry.
    console.error(`stripe webhook processing failed: ${err?.message || err}`);
  }
}
