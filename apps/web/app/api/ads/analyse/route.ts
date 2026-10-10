/**
 * Ads Studio — website analysis (A2; docs/47). POST { url } with the signed-in
 * user's Supabase access token (Authorization: Bearer …).
 *
 * The page is fetched here, on the server, under the rules in
 * packages/movie/src/intelligence/site-fetch.ts (public addresses only, ports
 * 80/443, 3 redirects, text/html, 1.5 MB, 10 s), stripped to what a visitor
 * reads, and read by the intelligence layer (task site_analysis, prompt
 * ads.site_analysis). Only facts whose quote is found on the page come back.
 *
 * Needs ANTHROPIC_API_KEY (or a site_analysis route in INTELLIGENCE_ROUTES) on
 * the web server; without it the route says so (503) — nothing is invented.
 * Each model call is logged as an `ai.decision` line in the server log (the web
 * has no service role to write ai_decisions; there is no project yet either).
 */
import { createClient } from "@supabase/supabase-js";
import {
  AnthropicProvider, analyseSite, fetchPublicPage, htmlToText, IntelligenceError, IntelligenceRouter, OpenAIProvider, PageFetchError,
} from "@cineforge/movie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The fetch (≤ 10 s) and one short model call.
export const maxDuration = 60;

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** The signed-in user behind the request's access token, or null. */
async function userOf(req: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!url || !key || !token) return null;
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

const FETCH_STATUS: Record<PageFetchError["code"], number> = {
  INVALID_URL: 400, BLOCKED_PORT: 400, BLOCKED_ADDRESS: 400, DNS_FAILED: 422, TOO_MANY_REDIRECTS: 422,
  HTTP_ERROR: 422, NOT_HTML: 422, TOO_LARGE: 422, TIMEOUT: 504, NETWORK: 502,
};

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return json(503, { error: "Sign-in is not configured on this deployment." });
  const userId = await userOf(req);
  if (!userId) return json(401, { error: "Sign in to analyse a website." });

  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  const raw = typeof body?.url === "string" ? body.url.trim() : "";
  if (!raw || raw.length > 2048) return json(400, { error: "Enter the page's full http:// or https:// address." });

  const router = new IntelligenceRouter([new AnthropicProvider(process.env), new OpenAIProvider(process.env)], process.env, (d) => {
    console.log(JSON.stringify({ event: "ai.decision", ...d, userId }));
  });
  if (!router.available("site_analysis")) {
    return json(503, { error: "Website analysis is not configured on this deployment (no model for site_analysis)." });
  }

  let page;
  try {
    page = await fetchPublicPage(raw);
  } catch (e) {
    if (e instanceof PageFetchError) return json(FETCH_STATUS[e.code], { error: e.message, code: e.code });
    throw e;
  }
  const { title, text } = htmlToText(page.html);
  if (text.length < 80) {
    return json(422, { error: "The page has almost no readable text (it may be drawn by JavaScript). Try a page whose text is in its HTML.", code: "NO_TEXT" });
  }

  try {
    const r = await analyseSite(router, { url: page.url, title, text });
    console.log(JSON.stringify({ event: "ads.site_analysis", userId, url: page.url, kept: r.facts.length, dropped: r.dropped.length }));
    return json(200, {
      url: page.url, title, brand: r.brand, facts: r.facts, dropped: r.dropped.length,
      fetchedAt: new Date().toISOString(), textChars: text.length, model: r.model,
    });
  } catch (e) {
    if (e instanceof IntelligenceError) {
      return json(e.code === "PROVIDER_UNAVAILABLE" ? 503 : 502, { error: `The page could not be read by the model (${e.code}).`, code: e.code });
    }
    throw e;
  }
}
