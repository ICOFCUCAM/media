/**
 * Execution-token minting (docs/38 §O as amended: Ed25519, docs/39 D1).
 *
 * Cineforge holds the Ed25519 private key; GPU workers hold only public keys
 * and verify (apps/gpu-worker/app/gateway). There is deliberately no HS256 or
 * other algorithm path. Uses node:crypto only — no JWT dependency.
 */
import { createHash, createPrivateKey, createPublicKey, randomUUID, sign, verify, type KeyObject } from "node:crypto";

/** Maximum token lifetime the GPU side accepts (seconds). */
export const MAX_TOKEN_TTL_SEC = 300;
export const DEFAULT_TOKEN_TTL_SEC = 120;
export const ISSUER = "cineforge-worker";

export type ExecutionScope = "video:run" | "status" | "warm";

export interface SigningKey {
  kid: string;
  privateKey: KeyObject;
  /** base64url raw 32-byte public key — the value to put in GPU_JWT_PUBLIC_KEYS. */
  publicKeyB64: string;
}

export interface ExecutionClaims {
  iss: string;
  aud: string;
  sub: string;
  scope: string;
  jti: string;
  iat: number;
  exp: number;
  bh: string;
  authz?: string;
}

// PKCS#8 DER prefix for an Ed25519 private key; the 32-byte seed follows.
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export function b64url(buf: Buffer | Uint8Array | string): string {
  return Buffer.from(buf).toString("base64url");
}

/** Parse `kid:base64url(32-byte Ed25519 seed)` (env GPU_JWT_SIGNING_KEY). */
export function parseSigningKey(spec: string): SigningKey {
  const i = spec.indexOf(":");
  if (i <= 0) throw new Error("GPU_JWT_SIGNING_KEY must be kid:base64url(seed)");
  const kid = spec.slice(0, i).trim();
  const seed = Buffer.from(spec.slice(i + 1).trim(), "base64url");
  if (seed.length !== 32) throw new Error("GPU_JWT_SIGNING_KEY seed must be 32 bytes");
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
  const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  return { kid, privateKey, publicKeyB64: b64url(spki.subarray(spki.length - 32)) };
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export interface MintInput {
  key: SigningKey;
  deploymentId: string;
  /** Grant id (equals body jobId) or a per-call id for status/warm. */
  subject: string;
  scope: ExecutionScope;
  /** Exact bytes that will be sent as the request body. */
  body: string;
  authz?: string;
  ttlSec?: number;
  now?: number; // seconds
  jti?: string;
}

export function mintExecutionToken(input: MintInput): { token: string; claims: ExecutionClaims } {
  const ttl = input.ttlSec ?? DEFAULT_TOKEN_TTL_SEC;
  if (ttl <= 0 || ttl > MAX_TOKEN_TTL_SEC) throw new Error(`token ttl must be 1..${MAX_TOKEN_TTL_SEC}s`);
  const iat = Math.floor(input.now ?? Date.now() / 1000);
  const claims: ExecutionClaims = {
    iss: ISSUER,
    aud: input.deploymentId,
    sub: input.subject,
    scope: input.scope,
    jti: input.jti ?? randomUUID(),
    iat,
    exp: iat + ttl,
    bh: sha256Hex(input.body),
    ...(input.authz ? { authz: input.authz } : {}),
  };
  const header = { alg: "EdDSA", kid: input.key.kid, typ: "JWT" };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = sign(null, Buffer.from(signingInput), input.key.privateKey);
  return { token: `${signingInput}.${b64url(sig)}`, claims };
}

/** Verify a token's signature with the public half (tests and admin tooling). */
export function verifyExecutionToken(token: string, publicKeyB64: string): ExecutionClaims | null {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKeyB64, "base64url")]);
  const pub = createPublicKey({ key: spki, format: "der", type: "spki" });
  const ok = verify(null, Buffer.from(`${h}.${p}`), pub, Buffer.from(s, "base64url"));
  return ok ? (JSON.parse(Buffer.from(p, "base64url").toString()) as ExecutionClaims) : null;
}
