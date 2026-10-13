/**
 * Server-side helpers for the Ads Studio routes (app/api/ads/*): the signed-in
 * user behind a request, and a Supabase client acting as that user (RLS
 * applies exactly as in the browser).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { FACT_KINDS, type AdAspect, type AdStoryScene, type AdvertBrief, type AdVoice, type SourceFact } from "@cineforge/movie";

export const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** The user's id and a client that acts as them, or null when the request is not signed in. */
export async function asUser(req: Request): Promise<{ userId: string; sb: SupabaseClient } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!url || !key || !token) return null;
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await sb.auth.getUser(token);
  return error || !data.user ? null : { userId: data.user.id, sb };
}

const SECONDS = [15, 30, 60, 90];
export const ASPECTS: AdAspect[] = ["16:9", "9:16", "1:1"];
const BEATS = ["opening", "problem", "solution", "how", "outcome", "cta"];
export const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The studio's inputs as an AdvertBrief, or why not (pure). */
export function readBrief(body: Record<string, unknown> | null): { brief: AdvertBrief } | { error: string } {
  if (!body) return { error: "Send the studio's settings as JSON." };
  const seconds = Number(body.seconds);
  if (!SECONDS.includes(seconds)) return { error: "The length must be 15, 30, 60 or 90 seconds." };
  const voice: AdVoice = body.voice === "none" ? "none" : "narrator";
  const src = (body.source ?? null) as Record<string, unknown> | null;
  const facts: SourceFact[] = (Array.isArray(src?.facts) ? src!.facts : []).flatMap((f) => {
    const x = (f ?? {}) as Record<string, unknown>;
    const kind = String(x.kind ?? "");
    const statement = str(x.statement, 300);
    const quote = str(x.quote, 300);
    return (FACT_KINDS as readonly string[]).includes(kind) && statement && quote ? [{ kind: kind as SourceFact["kind"], statement, quote }] : [];
  }).slice(0, 12);
  const brief = str(body.brief, 2000);
  if (!brief && !facts.length) return { error: "Describe what the ad should achieve, or analyse a website first." };
  return {
    brief: {
      brief, seconds, voice, style: str(body.style, 80) || "Cinematic premium",
      url: str(src?.url, 2048) || null, brand: str(src?.brand, 120) || str(body.brand, 120) || null, title: str(src?.title, 300) || null,
      facts, productPhotos: Math.max(0, Math.min(8, Number(body.productPhotos) || 0)), logo: body.logo === true,
    },
  };
}

/** The storyboard as the owner edited it (only known fields kept) (pure). */
export function readScenes(raw: unknown): AdStoryScene[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 24).flatMap((s) => {
    const x = (s ?? {}) as Record<string, unknown>;
    const beat = String(x.beat ?? "");
    if (!BEATS.includes(beat)) return [];
    return [{
      beat: beat as AdStoryScene["beat"], title: str(x.title, 120) || "Scene", seconds: Math.max(5, Math.round((Number(x.seconds) || 5) / 5) * 5),
      visual: str(x.visual, 600), message: str(x.message, 400), showProduct: x.showProduct !== false,
    }];
  });
}

