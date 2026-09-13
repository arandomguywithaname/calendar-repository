import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { identityDir, jwkThumbprint } from "./identity";

/**
 * "I am a bot, but I was sent by someone."
 *
 * The signature in identity.ts proves *which agent* is knocking. It says
 * nothing about why it should be let in. A mandate is the other half: a short,
 * signed, expiring statement from a named human saying "I authorised this
 * agent key, for these sites, for this purpose, until this date".
 *
 * It is a compact JWS (Ed25519/EdDSA) signed by the principal's own key, sent
 * as an `Agent-Mandate` request header:
 *
 *   { "iss": "mailto:someone@example.com",   <- the human who sent it
 *     "sub": "<agent JWK thumbprint>",       <- the key that may act for them
 *     "aud": ["decathlon.fr"],               <- where it is good for
 *     "purpose": "price research",
 *     "constraints": { ... },                <- what it promises not to do
 *     "iat": ..., "exp": ... }
 *
 * Two honest limits, stated here so nobody has to discover them the hard way:
 *
 * 1. `Agent-Mandate` is this project's own header, not an IETF standard. Web
 *    Bot Auth standardises agent identity; delegation from a human principal
 *    is still being argued about. Nothing will reject you for sending it, and
 *    nothing will admit you for it either — today its value is that it is
 *    verifiable, scoped, revocable and auditable, and that it is the shape the
 *    ecosystem is converging on.
 * 2. The principal's key is self-asserted. It proves the same human authorised
 *    this agent across sessions; it does not prove who that human is. Binding
 *    that to a real identity needs a third party, which is a different problem.
 */

export const MANDATE_HEADER = "Agent-Mandate";
const TYP = "agent-mandate+jws";

export interface PrincipalKey {
  privateKeyPem: string;
  publicJwk: { kty: string; crv: string; x: string };
  thumbprint: string;
  /** How the principal names themselves, e.g. "mailto:you@example.com". */
  id: string;
  createdAt: string;
}

export interface MandateClaims {
  /** The principal: the human who sent the agent. */
  iss: string;
  /** The agent key thumbprint this mandate authorises. */
  sub: string;
  /** Hosts this mandate is good for. ["*"] means unscoped. */
  aud: string[];
  purpose: string;
  iat: number;
  exp: number;
  /** Unique id, so a mandate can be named in a revocation or a log. */
  jti: string;
  /** What the agent is promising not to do. Descriptive, and enforced in code. */
  constraints: Record<string, boolean | string>;
}

function principalKeyPath(): string {
  return path.join(identityDir(), "principal-key.json");
}

function mandatePath(): string {
  return path.join(identityDir(), "mandate.jws");
}

const b64u = (b: Buffer | string) => Buffer.from(b as any).toString("base64url");

/** Create the principal's own key — the human's, not the agent's. */
export function createPrincipalKey(id: string): PrincipalKey {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as any;
  const publicJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x };
  const key: PrincipalKey = {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicJwk,
    thumbprint: jwkThumbprint(publicJwk),
    id,
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(identityDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(principalKeyPath(), JSON.stringify(key, null, 2), { mode: 0o600 });
  return key;
}

export function loadPrincipalKey(): PrincipalKey | null {
  const p = principalKeyPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as PrincipalKey;
  } catch (err) {
    console.error(`Could not read ${p}:`, err);
    return null;
  }
}

/**
 * The constraints every mandate this connector issues carries. These are not
 * decoration: each one is enforced somewhere in src/browser/, and claiming one
 * the code does not keep would make the whole exercise worthless.
 */
export function standardConstraints(): Record<string, boolean | string> {
  return {
    // guards.ts — detected and handed to the human, never solved.
    solvesCaptchas: false,
    // mcp.ts — purchase controls are refused.
    placesOrders: false,
    // mcp.ts — password fields are refused; OTP is a human handoff.
    entersCredentials: false,
    // robots.ts — checked before navigation.
    respectsRobotsTxt: true,
    // session.ts — the window is visible and a person is at it.
    humanInTheLoop: true,
  };
}

/** Sign a mandate with the principal's key. Returns the compact JWS. */
export function issueMandate(
  principal: PrincipalKey,
  agentThumbprint: string,
  opts: { scope: string[]; purpose: string; days: number; now?: number }
): string {
  const iat = opts.now ?? Math.floor(Date.now() / 1000);
  const claims: MandateClaims = {
    iss: principal.id,
    sub: agentThumbprint,
    aud: opts.scope.length ? opts.scope.map((s) => s.toLowerCase().replace(/^\.?(www\.)?/, "")) : ["*"],
    purpose: opts.purpose,
    iat,
    exp: iat + Math.round(opts.days * 86400),
    jti: crypto.randomUUID(),
    constraints: standardConstraints(),
  };
  const header = { alg: "EdDSA", typ: TYP, kid: principal.thumbprint };
  const signingInput = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claims))}`;
  const key = crypto.createPrivateKey(principal.privateKeyPem);
  const sig = crypto.sign(null, Buffer.from(signingInput, "utf-8"), key).toString("base64url");
  return `${signingInput}.${sig}`;
}

export function saveMandate(jws: string): void {
  fs.mkdirSync(identityDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(mandatePath(), jws, { mode: 0o600 });
}

export function loadMandate(): string | null {
  const p = mandatePath();
  return fs.existsSync(p) ? fs.readFileSync(p, "utf-8").trim() : null;
}

/** Read the claims without checking anything — for display only. */
export function decodeMandate(jws: string): MandateClaims | null {
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8")) as MandateClaims;
  } catch {
    return null;
  }
}

export interface MandateCheck {
  valid: boolean;
  reason?: string;
  claims?: MandateClaims;
}

/**
 * Check a mandate the way a site would: signature against the principal's key,
 * then the time window, then that it actually names this agent.
 */
export function verifyMandate(
  jws: string,
  principalJwk: { kty: string; crv: string; x: string },
  expectedAgentThumbprint?: string,
  now = Math.floor(Date.now() / 1000)
): MandateCheck {
  const parts = jws.split(".");
  if (parts.length !== 3) return { valid: false, reason: "not a compact JWS" };

  let header: any;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
  } catch {
    return { valid: false, reason: "unreadable header" };
  }
  if (header.alg !== "EdDSA") return { valid: false, reason: `unexpected alg "${header.alg}"` };
  if (header.typ !== TYP) return { valid: false, reason: `unexpected typ "${header.typ}"` };
  if (header.kid !== jwkThumbprint(principalJwk)) {
    return { valid: false, reason: "mandate was signed by a different principal key" };
  }

  const publicKey = crypto.createPublicKey({ key: principalJwk as any, format: "jwk" });
  const ok = crypto.verify(
    null,
    Buffer.from(`${parts[0]}.${parts[1]}`, "utf-8"),
    publicKey,
    Buffer.from(parts[2], "base64url")
  );
  if (!ok) return { valid: false, reason: "signature does not verify" };

  const claims = decodeMandate(jws);
  if (!claims) return { valid: false, reason: "unreadable claims" };
  if (claims.exp <= now) return { valid: false, reason: "mandate has expired", claims };
  if (claims.iat > now + 60) return { valid: false, reason: "mandate is not valid yet", claims };
  if (expectedAgentThumbprint && claims.sub !== expectedAgentThumbprint) {
    return { valid: false, reason: "mandate authorises a different agent key", claims };
  }
  return { valid: true, claims };
}

/**
 * Does this mandate cover this URL? An out-of-scope request simply travels
 * without it — sending a mandate that does not apply is worse than sending
 * none, because it invites a site to treat the scope as decoration.
 */
export function mandateCoversUrl(claims: MandateClaims, url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return claims.aud.some((entry) => entry === "*" || host === entry || host.endsWith("." + entry));
}

/** Short, non-sensitive summary for the agent card and the identity tool. */
export function summarizeMandate(claims: MandateClaims): Record<string, unknown> {
  return {
    principal: claims.iss,
    agentKey: claims.sub,
    scope: claims.aud,
    purpose: claims.purpose,
    issued: new Date(claims.iat * 1000).toISOString(),
    expires: new Date(claims.exp * 1000).toISOString(),
    expired: claims.exp <= Math.floor(Date.now() / 1000),
    id: claims.jti,
    constraints: claims.constraints,
  };
}
