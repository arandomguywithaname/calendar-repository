import * as crypto from "crypto";

/**
 * Many users, no user database.
 *
 * Each family member's personal links are *derived* from the two server
 * secrets with an HMAC, so the server can verify any member's link
 * statelessly — nothing to register, nothing to lose on a redeploy:
 *
 *   send link:      /ingest/<name>/<hmac(HEALTH_INGEST_TOKEN, "ingest|name")>
 *   connector link: /mcp/<name>/<hmac(MCP_TOKEN, "mcp|name")>
 *
 * `npm run user -- Papa` computes the same signatures on the laptop from
 * .env and prints the links. Data is stored per user (users/<name>.json);
 * the original single-user links keep working as the "default" user.
 */

export interface HealthUser {
  /** URL-safe lowercase identifier, also the store file name. */
  slug: string;
  /** What Claude calls this person ("Papa", "Tim"). */
  name: string;
}

export function slugify(name: string): string | undefined {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length >= 2 && slug.length <= 32 ? slug : undefined;
}

function displayName(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
}

export function signature(kind: "ingest" | "mcp", secret: string, slug: string): string {
  return crypto.createHmac("sha256", secret).update(`${kind}|${slug}`).digest("hex").slice(0, 40);
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Verifies a personal link's signature; returns the user if it checks out. */
export function verifyUser(
  kind: "ingest" | "mcp",
  secret: string | undefined,
  rawSlug: unknown,
  rawSig: unknown
): HealthUser | undefined {
  if (!secret || typeof rawSlug !== "string" || typeof rawSig !== "string") return undefined;
  const slug = slugify(rawSlug);
  if (!slug || slug !== rawSlug.toLowerCase()) return undefined;
  if (!safeEqual(rawSig, signature(kind, secret, slug))) return undefined;
  return { slug, name: displayName(slug) };
}
