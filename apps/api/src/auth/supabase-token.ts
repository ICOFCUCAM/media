/**
 * Verify a Supabase Auth access token (the web app's session) for the public
 * API. Two ways, chosen by configuration — never by the token:
 *
 *   SUPABASE_JWT_SECRET  projects on the legacy shared secret: HS256 only
 *   SUPABASE_URL         projects on asymmetric signing keys: ES256 / RS256
 *                        against the project's JWKS
 *                        (<SUPABASE_URL>/auth/v1/.well-known/jwks.json)
 *
 * Either way the audience must be "authenticated", the token unexpired, and
 * `sub` a user id. The algorithm list is pinned (no "none", no HS/RS
 * confusion). Roles are NOT read from the token: Supabase puts the Postgres
 * role there ("authenticated"), and CineForge's ADMIN lives in users.role —
 * the guard reads it from the database.
 */
import { createPublicKey, type KeyObject } from "node:crypto";
import jwt from "jsonwebtoken";

export class TokenError extends Error {}

type Env = Record<string, string | undefined>;
type Jwk = { kid?: string; kty: string; alg?: string; use?: string } & Record<string, unknown>;

export interface VerifiedToken {
  userId: string;
  email: string | null;
}

const JWKS_TTL_MS = 10 * 60_000;
let cache: { url: string; at: number; keys: Map<string, KeyObject> } | null = null;

async function jwks(url: string, f: typeof fetch): Promise<Map<string, KeyObject>> {
  if (cache && cache.url === url && Date.now() - cache.at < JWKS_TTL_MS) return cache.keys;
  const res = await f(url);
  if (!res.ok) throw new TokenError(`signing keys unavailable (${res.status})`);
  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = new Map<string, KeyObject>();
  for (const k of body.keys ?? []) {
    if (!k.kid || (k.use && k.use !== "sig")) continue;
    keys.set(k.kid, createPublicKey({ key: k as never, format: "jwk" }));
  }
  cache = { url, at: Date.now(), keys };
  return keys;
}

/** Test hook. */
export function _resetJwksCache(): void {
  cache = null;
}

export async function verifySupabaseToken(token: string, env: Env = process.env, f: typeof fetch = fetch): Promise<VerifiedToken> {
  const secret = env.SUPABASE_JWT_SECRET;
  const base = env.SUPABASE_URL?.replace(/\/+$/, "");
  let payload: jwt.JwtPayload;
  try {
    if (secret) {
      payload = jwt.verify(token, secret, { algorithms: ["HS256"], audience: "authenticated" }) as jwt.JwtPayload;
    } else if (base) {
      const header = jwt.decode(token, { complete: true })?.header;
      if (!header?.kid) throw new TokenError("token has no key id");
      let key = (await jwks(`${base}/auth/v1/.well-known/jwks.json`, f)).get(header.kid);
      if (!key) {
        _resetJwksCache(); // keys rotate: one refresh, then refuse
        key = (await jwks(`${base}/auth/v1/.well-known/jwks.json`, f)).get(header.kid);
      }
      if (!key) throw new TokenError("unknown signing key");
      payload = jwt.verify(token, key, { algorithms: ["ES256", "RS256"], audience: "authenticated", issuer: `${base}/auth/v1` }) as jwt.JwtPayload;
    } else {
      throw new TokenError("auth is not configured (SUPABASE_JWT_SECRET or SUPABASE_URL)");
    }
  } catch (e) {
    if (e instanceof TokenError) throw e;
    throw new TokenError(e instanceof Error ? e.message : "invalid token");
  }
  if (typeof payload.sub !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.sub)) throw new TokenError("token has no user");
  return { userId: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
}
