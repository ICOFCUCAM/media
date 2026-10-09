import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it } from "vitest";
import "reflect-metadata";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { _resetJwksCache, verifySupabaseToken } from "./supabase-token";

const USER = "11111111-1111-4111-8111-111111111111";
const SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const URL_ = "https://abc.supabase.co";
const sign = (claims: object, opts: jwt.SignOptions = {}) =>
  jwt.sign({ sub: USER, aud: "authenticated", role: "authenticated", ...claims }, SECRET, { algorithm: "HS256", expiresIn: 60, ...opts });

afterEach(() => _resetJwksCache());

describe("Supabase tokens on the shared secret (HS256)", () => {
  const env = { SUPABASE_JWT_SECRET: SECRET };

  it("accepts a session token and returns the user", async () => {
    expect(await verifySupabaseToken(sign({ email: "a@b.c" }), env)).toEqual({ userId: USER, email: "a@b.c" });
  });

  it("refuses the wrong audience, an expired token, the wrong secret and alg none", async () => {
    await expect(verifySupabaseToken(sign({ aud: "anon" }), env)).rejects.toThrow(/audience/);
    await expect(verifySupabaseToken(sign({}, { expiresIn: -10 }), env)).rejects.toThrow(/expired/);
    await expect(verifySupabaseToken(jwt.sign({ sub: USER, aud: "authenticated" }, "another-secret-of-sufficient-length-123456"), env)).rejects.toThrow(/signature/);
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: USER, aud: "authenticated" })).toString("base64url")}.`;
    await expect(verifySupabaseToken(none, env)).rejects.toThrow();
  });

  it("refuses HS384/HS512 (the algorithm list is pinned)", async () => {
    await expect(verifySupabaseToken(sign({}, { algorithm: "HS512" }), env)).rejects.toThrow(/invalid algorithm/);
  });

  it("refuses a token without a user id", async () => {
    await expect(verifySupabaseToken(sign({ sub: "service" }), env)).rejects.toThrow(/no user/);
  });

  it("with nothing configured, fails closed", async () => {
    await expect(verifySupabaseToken(sign({}), {})).rejects.toThrow(/not configured/);
  });
});

describe("Supabase tokens on asymmetric keys (JWKS)", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "ES256", use: "sig" };
  let calls = 0;
  const fetchJwks = (async (url: string) => {
    calls++;
    expect(url).toBe(`${URL_}/auth/v1/.well-known/jwks.json`);
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
  }) as unknown as typeof fetch;
  const es = (claims: object, kid = "k1") =>
    jwt.sign({ sub: USER, aud: "authenticated", iss: `${URL_}/auth/v1`, ...claims }, privateKey, { algorithm: "ES256", keyid: kid, expiresIn: 60 });

  it("verifies against the project's published keys, caching them", async () => {
    calls = 0;
    const env = { SUPABASE_URL: `${URL_}/` };
    expect((await verifySupabaseToken(es({}), env, fetchJwks)).userId).toBe(USER);
    await verifySupabaseToken(es({}), env, fetchJwks);
    expect(calls).toBe(1);
  });

  it("refuses another issuer, an unknown key (after one refresh) and an HS token forged with the public key", async () => {
    const env = { SUPABASE_URL: URL_ };
    await expect(verifySupabaseToken(es({ iss: "https://evil.example/auth/v1" }), env, fetchJwks)).rejects.toThrow(/issuer/);
    _resetJwksCache();
    calls = 0;
    await expect(verifySupabaseToken(es({}, "rotated-away"), env, fetchJwks)).rejects.toThrow(/unknown signing key/);
    expect(calls).toBe(2);
    const pem = publicKey.export({ format: "pem", type: "spki" }).toString();
    const forged = jwt.sign({ sub: USER, aud: "authenticated", iss: `${URL_}/auth/v1` }, pem, { algorithm: "HS256", keyid: "k1" });
    await expect(verifySupabaseToken(forged, env, fetchJwks)).rejects.toThrow(/invalid algorithm/);
  });
});

describe("the API guard", () => {
  const ctx = (authorization?: string) => {
    const req: { headers: Record<string, string>; user?: unknown } = { headers: authorization ? { authorization } : {} };
    return { req, ctx: { switchToHttp: () => ({ getRequest: () => req }) } as never };
  };

  it("takes the role from CineForge's users table, never from the token", async () => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
    try {
      const guard = new JwtAuthGuard(async () => "USER");
      const { req, ctx: c } = ctx(`Bearer ${sign({ role: "ADMIN", app_metadata: { role: "ADMIN" } })}`);
      expect(await guard.canActivate(c)).toBe(true);
      expect(req.user).toEqual({ id: USER, role: "USER" });
      const admin = ctx(`Bearer ${sign({})}`);
      await new JwtAuthGuard(async () => "ADMIN").canActivate(admin.ctx);
      expect(admin.req.user).toEqual({ id: USER, role: "ADMIN" });
    } finally {
      delete process.env.SUPABASE_JWT_SECRET;
    }
  });

  it("401 without a token, with a bad token, or with no CineForge account; 503 when auth is not configured", async () => {
    await expect(new JwtAuthGuard(async () => "USER").canActivate(ctx().ctx)).rejects.toMatchObject({ status: 401 });
    await expect(new JwtAuthGuard(async () => "USER").canActivate(ctx(`Bearer ${sign({})}`).ctx)).rejects.toMatchObject({ status: 503 });
    process.env.SUPABASE_JWT_SECRET = SECRET;
    try {
      await expect(new JwtAuthGuard(async () => "USER").canActivate(ctx("Bearer nope").ctx)).rejects.toMatchObject({ status: 401 });
      await expect(new JwtAuthGuard(async () => null).canActivate(ctx(`Bearer ${sign({})}`).ctx)).rejects.toMatchObject({ status: 401 });
    } finally {
      delete process.env.SUPABASE_JWT_SECRET;
    }
  });
});
