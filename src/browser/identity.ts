import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * Who this agent is, and how it proves it.
 *
 * The premise: a shop's front door asks "what are you?". Answering "a bot" gets
 * you turned away, and answering "a person" is a lie that fingerprinting will
 * catch anyway. The third answer — the one this file implements — is
 * "an agent, here is my key, and here is a signed mandate from the person who
 * sent me". That is a claim a site can verify and decide about, which is what
 * site operators have been asking for.
 *
 * The wire format is Web Bot Auth: a profile of HTTP Message Signatures
 * (RFC 9421) where the agent signs each request with an Ed25519 key and
 * publishes the public half as a JWKS at a well-known URL.
 *
 *   Signature-Agent: "https://your-host"        <- where the key lives
 *   Signature-Input: sig1=("@authority" "signature-agent");created=...;
 *                    keyid="<JWK thumbprint>";alg="ed25519";expires=...;
 *                    nonce="...";tag="web-bot-auth"
 *   Signature:       sig1=:<base64 ed25519 signature>:
 *
 * Verified against the published Cloudflare/RFC 9421 test vector — see
 * test/identity.test.js, which reproduces their example signature exactly.
 *
 * What this does NOT do is make anyone let you in. A site has to choose to
 * verify and allow the key; until it does, a signed request is just a request
 * with three extra headers it ignores. That is the honest state of the art.
 */

const PRODUCT = "ClaudeBrowserConnector";
const VERSION = "1.0";

/** The well-known path the public key directory is served from. */
export const DIRECTORY_PATH = "/.well-known/http-message-signatures-directory";
export const DIRECTORY_CONTENT_TYPE = "application/http-message-signatures-directory+json";
/** Non-standard, this project's own: a human-readable description of the operator. */
export const AGENT_CARD_PATH = "/.well-known/agent-card";

export interface Operator {
  /** Who runs this agent, e.g. "Tim Grivkovs". */
  name: string;
  /** How a site operator reaches a human about it. */
  contact: string;
  /** Public base URL where the directory and card are served. */
  baseUrl: string;
  /** One line on what it is used for. */
  purpose: string;
}

export interface StoredKey {
  /** Private key, PKCS#8 PEM. Never leaves the machine. */
  privateKeyPem: string;
  publicJwk: { kty: string; crv: string; x: string };
  /** RFC 8037 JWK thumbprint, base64url — this is the `keyid` on the wire. */
  thumbprint: string;
  createdAt: string;
}

export interface AgentIdentity {
  key: StoredKey;
  operator: Operator;
}

/** Where keys and the mandate live. Outside the repo on purpose. */
export function identityDir(): string {
  return process.env.AGENT_IDENTITY_DIR || path.join(os.homedir(), ".claude-agent-identity");
}

function agentKeyPath(): string {
  return path.join(identityDir(), "agent-key.json");
}

/**
 * RFC 8037 appendix A.3: SHA-256 over the canonical JWK — required members
 * only, lexicographic order, no whitespace — base64url encoded.
 */
export function jwkThumbprint(jwk: { kty: string; crv: string; x: string }): string {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x });
  return crypto.createHash("sha256").update(canonical).digest("base64url");
}

/** Generate a fresh Ed25519 identity. Writes the private key 0600. */
export function createIdentity(operator: Operator): AgentIdentity {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" }) as any;
  const publicJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x };
  const key: StoredKey = {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicJwk,
    thumbprint: jwkThumbprint(publicJwk),
    createdAt: new Date().toISOString(),
  };
  const identity: AgentIdentity = { key, operator };
  fs.mkdirSync(identityDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(agentKeyPath(), JSON.stringify(identity, null, 2), { mode: 0o600 });
  return identity;
}

let cached: AgentIdentity | null | undefined;

/** The identity on this machine, or null if none has been created. */
export function loadIdentity(): AgentIdentity | null {
  if (cached !== undefined) return cached;
  const p = agentKeyPath();
  if (!fs.existsSync(p)) {
    cached = null;
    return null;
  }
  try {
    cached = JSON.parse(fs.readFileSync(p, "utf-8")) as AgentIdentity;
  } catch (err) {
    console.error(`Could not read ${p}:`, err);
    cached = null;
  }
  return cached;
}

/** Drop the cache — used by the tests and after creating an identity. */
export function resetIdentityCache(): void {
  cached = undefined;
}

/**
 * How loudly to declare. "full" adds the honest User-Agent and signs; "sign"
 * signs without touching the User-Agent (for sites that verify signatures but
 * block on UA strings); "off" changes nothing about the traffic.
 * Defaults to "full" once an identity exists, "off" before that.
 */
export function declareMode(): "full" | "sign" | "off" {
  const raw = (process.env.AGENT_DECLARE || "").toLowerCase();
  if (raw === "full" || raw === "sign" || raw === "off") return raw;
  return loadIdentity() ? "full" : "off";
}

/**
 * Appended to the browser's real User-Agent rather than replacing it: the page
 * still gets the rendering hints it expects, and the declaration rides along
 * where a site operator or a log reader will actually see it.
 */
export function userAgentSuffix(identity: AgentIdentity): string {
  const card = new URL(AGENT_CARD_PATH, identity.operator.baseUrl).toString();
  return `${PRODUCT}/${VERSION} (+${card})`;
}

/** The JWKS served at the well-known directory path. */
export function directoryDocument(identity: AgentIdentity): { keys: unknown[] } {
  return { keys: [{ ...identity.key.publicJwk, kid: identity.key.thumbprint, use: "sig", alg: "EdDSA" }] };
}

/** Non-standard companion doc: who runs this agent, and how to reach them. */
export function agentCard(identity: AgentIdentity, mandateSummary?: unknown): Record<string, unknown> {
  return {
    name: `${PRODUCT}/${VERSION}`,
    operator: identity.operator.name,
    contact: identity.operator.contact,
    purpose: identity.operator.purpose,
    keyid: identity.key.thumbprint,
    directory: new URL(DIRECTORY_PATH, identity.operator.baseUrl).toString(),
    automation: {
      humanInTheLoop: true,
      note:
        "Drives a human-operated browser under supervision. It does not solve or bypass CAPTCHAs, " +
        "does not place orders or take payments, and respects robots.txt.",
    },
    ...(mandateSummary ? { mandate: mandateSummary } : {}),
  };
}

/**
 * Serialize the signature parameters exactly as they appear on the wire. The
 * same string goes into Signature-Input and into the last line of the
 * signature base, so it is built once here — a mismatch between the two is the
 * classic way to produce a signature that verifies nowhere.
 */
function signatureParams(
  covered: string[],
  p: { created: number; expires: number; keyid: string; nonce: string }
): string {
  const list = covered.map((c) => `"${c}"`).join(" ");
  return (
    `(${list})` +
    `;created=${p.created}` +
    `;keyid="${p.keyid}"` +
    `;alg="ed25519"` +
    `;expires=${p.expires}` +
    `;nonce="${p.nonce}"` +
    `;tag="web-bot-auth"`
  );
}

/**
 * The RFC 9421 signature base: one line per covered component, then
 * "@signature-params". Lines joined with LF, no trailing newline.
 */
export function signatureBase(components: [string, string][], params: string): string {
  const lines = components.map(([name, value]) => `"${name}": ${value}`);
  lines.push(`"@signature-params": ${params}`);
  return lines.join("\n");
}

/** `@authority` is the host with its port, lowercased, default ports omitted. */
export function authorityOf(url: string): string {
  const u = new URL(url);
  return u.host.toLowerCase();
}

export interface SignedHeaders {
  "Signature-Agent": string;
  "Signature-Input": string;
  Signature: string;
}

/**
 * Sign one request. Covers `@authority` and `signature-agent` — the minimum the
 * Web Bot Auth profile recommends, and the pair that actually matters: this key
 * is vouching for a request to this host, and here is where to find the key.
 */
export function signRequest(
  identity: AgentIdentity,
  url: string,
  opts: { now?: number; lifetimeSeconds?: number; nonce?: string; label?: string } = {}
): SignedHeaders {
  const created = opts.now ?? Math.floor(Date.now() / 1000);
  const expires = created + (opts.lifetimeSeconds ?? 300);
  const nonce = opts.nonce ?? crypto.randomBytes(64).toString("base64");
  const label = opts.label ?? "sig1";
  const signatureAgent = `"${identity.operator.baseUrl.replace(/\/+$/, "")}"`;

  const params = signatureParams(["@authority", "signature-agent"], {
    created,
    expires,
    keyid: identity.key.thumbprint,
    nonce,
  });
  const base = signatureBase(
    [
      ["@authority", authorityOf(url)],
      ["signature-agent", signatureAgent],
    ],
    params
  );
  const privateKey = crypto.createPrivateKey(identity.key.privateKeyPem);
  const signature = crypto.sign(null, Buffer.from(base, "utf-8"), privateKey).toString("base64");

  return {
    "Signature-Agent": signatureAgent,
    "Signature-Input": `${label}=${params}`,
    Signature: `${label}=:${signature}:`,
  };
}

/**
 * Verify a signature produced by signRequest. Used by the tests and by the
 * `browser_identity` tool so a user can confirm their setup actually works
 * before wondering why a site is ignoring it.
 */
export function verifySignature(
  publicJwk: { kty: string; crv: string; x: string },
  url: string,
  headers: { "Signature-Input": string; Signature: string; "Signature-Agent": string }
): { valid: boolean; reason?: string } {
  const inputMatch = /^([^=]+)=(\(.*)$/.exec(headers["Signature-Input"]);
  const sigMatch = /^([^=]+)=:(.*):$/.exec(headers.Signature);
  if (!inputMatch || !sigMatch) return { valid: false, reason: "malformed Signature-Input or Signature header" };
  if (inputMatch[1] !== sigMatch[1]) return { valid: false, reason: "signature label mismatch" };

  const params = inputMatch[2];
  const expires = /;expires=(\d+)/.exec(params);
  if (expires && Number(expires[1]) < Math.floor(Date.now() / 1000)) {
    return { valid: false, reason: "signature has expired" };
  }
  if (!/;tag="web-bot-auth"/.test(params)) return { valid: false, reason: 'missing tag="web-bot-auth"' };

  const base = signatureBase(
    [
      ["@authority", authorityOf(url)],
      ["signature-agent", headers["Signature-Agent"]],
    ],
    params
  );
  const publicKey = crypto.createPublicKey({ key: publicJwk as any, format: "jwk" });
  const ok = crypto.verify(null, Buffer.from(base, "utf-8"), publicKey, Buffer.from(sigMatch[2], "base64"));
  return ok ? { valid: true } : { valid: false, reason: "signature does not verify against this key" };
}
