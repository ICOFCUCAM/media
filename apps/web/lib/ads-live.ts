"use client";

/**
 * The Ads Studio connected to production (docs/47):
 *
 *   A2  `analyseWebsite` asks the server route (app/api/ads/analyse) to fetch
 *       and read the page; only facts quoted from the page come back.
 *   A3  `uploadBrandFiles` puts the logo and product photographs in the
 *       owner's folder (brand/<uid>/…, migration 0060). With the facts they
 *       travel to /create/advert as an `AdsHandoff` in this tab's session
 *       storage; `createProject` records them on the advert (ad_source,
 *       brand_assets) before the worker may claim it.
 *   A5  Once the advert is planned, its storyboard edits the LIVE project
 *       through the Director chat — the same path as the Director workspace
 *       (director_messages → one canon change → an edit request → only the
 *       touched shots regenerate; timing goes to the Editor for approval).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { loadConversation, sendInstruction, type ChatMessage } from "./workspace";
import { listEditRequests, type EditRequestRow } from "./production";
import { loadDegradations, type DegradationRow } from "./truth";
import { BRAND_IMAGE_TYPES, sceneInstructions, type SceneDraft, type SiteAnalysis, type SiteFact } from "./ads-studio";

export { sceneInstructions, type SceneDraft };

const untyped = (): SupabaseClient | null => getSupabase() as unknown as SupabaseClient | null;
export const BRAND_BUCKET = "cineforge-assets";
/** Largest brand file accepted (the database allows 15 MB). */
export const BRAND_MAX_BYTES = 15 * 1024 * 1024;
export const PRODUCT_PHOTOS_MAX = 8;

/* ── A2: website analysis ─────────────────────────────────────────────── */

export async function signedInUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Fetch and read a page on the server; throws with the route's own reason. */
export async function analyseWebsite(url: string): Promise<SiteAnalysis> {
  const sb = getSupabase();
  const token = sb ? (await sb.auth.getSession()).data.session?.access_token : null;
  if (!token) throw new Error("Sign in to analyse a website.");
  const res = await fetch("/api/ads/analyse", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<SiteAnalysis> & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `The analysis failed (${res.status}).`);
  return {
    url: String(body.url ?? url), title: body.title ?? null, brand: body.brand ?? null,
    facts: (body.facts ?? []) as SiteFact[], dropped: Number(body.dropped ?? 0), fetchedAt: String(body.fetchedAt ?? new Date().toISOString()),
  };
}

/* ── A3: brand files ───────────────────────────────────────────────────── */

export interface BrandFileRef {
  role: "logo" | "product";
  storageKey: string;
  name: string;
  mime: string;
  bytes: number;
}

/** Why a file cannot go to production, or null when it can. */
export function brandFileProblem(f: { type: string; size: number }): string | null {
  if (!BRAND_IMAGE_TYPES.includes(f.type)) return "only PNG, JPEG or WebP images go into production";
  if (f.size > BRAND_MAX_BYTES) return "larger than 15 MB";
  return null;
}

/** Upload the logo and product photographs to the owner's brand folder. */
export async function uploadBrandFiles(files: { file: File; role: "logo" | "product" }[]): Promise<BrandFileRef[]> {
  const sb = getSupabase();
  const uid = await signedInUserId();
  if (!sb || !uid) throw new Error("Sign in to send brand files to production.");
  const out: BrandFileRef[] = [];
  for (const { file, role } of files) {
    const problem = brandFileProblem(file);
    if (problem) throw new Error(`${file.name}: ${problem}.`);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const storageKey = `brand/${uid}/${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from(BRAND_BUCKET).upload(storageKey, file, { contentType: file.type, upsert: false });
    if (up.error) throw new Error(`${file.name}: ${up.error.message}`);
    out.push({ role, storageKey, name: file.name.slice(0, 200), mime: file.type, bytes: file.size });
  }
  return out;
}

/* ── The hand-off to /create/advert ────────────────────────────────────── */

/** What the Ads Studio gives the advert project besides its brief (stored as projects.ad_source + brand_assets). */
export interface AdsHandoff {
  source: { url: string; title: string | null; brand: string | null; fetchedAt: string; facts: SiteFact[] } | null;
  brandFiles: BrandFileRef[];
}

const HANDOFF_KEY = "cf.ads.handoff:";

export function stashHandoff(h: AdsHandoff): string {
  const id = crypto.randomUUID().slice(0, 8);
  try {
    sessionStorage.setItem(HANDOFF_KEY + id, JSON.stringify(h));
  } catch {
    return "";
  }
  return id;
}

/** The stashed hand-off (read once; anything malformed is dropped). */
export function takeHandoff(id: string | null): AdsHandoff | null {
  if (!id) return null;
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY + id);
    if (!raw) return null;
    const h = JSON.parse(raw) as AdsHandoff;
    return {
      source: h.source && Array.isArray(h.source.facts) ? h.source : null,
      brandFiles: (Array.isArray(h.brandFiles) ? h.brandFiles : []).filter((f) => (f.role === "logo" || f.role === "product") && typeof f.storageKey === "string"),
    };
  } catch {
    return null;
  }
}

/* ── A5: the live advert ───────────────────────────────────────────────── */

export interface AdvertProject {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

/** The owner's advert projects, newest first. */
export async function listAdverts(): Promise<AdvertProject[]> {
  const sb = untyped();
  if (!sb) return [];
  const { data, error } = await sb.from("projects").select("id,title,status,created_at").eq("kind", "advert").order("created_at", { ascending: false }).limit(20);
  if (error) return [];
  return ((data ?? []) as { id: string; title: string; status: string; created_at: string }[]).map((p) => ({ id: p.id, title: p.title, status: p.status, createdAt: p.created_at }));
}

export interface LiveScene {
  id: string;
  index: number;
  heading: string;
  summary: string;
  narration: string | null;
  firstLine: string | null;
  status: string;
  durationSec: number;
  /** A frame to show: the first shot's thumbnail or still (storage key). */
  frameKey: string | null;
  shots: { id: string; index: number; status: string }[];
}

export async function loadLiveScenes(projectId: string): Promise<LiveScene[]> {
  const sb = untyped();
  if (!sb) return [];
  const { data } = await sb
    .from("scenes")
    .select("id,index,heading,summary,narration,status,duration_sec,shots(id,index,status,duration_sec,seed_image_key,thumbnail_key),dialogue_lines(index,text)")
    .eq("project_id", projectId)
    .order("index");
  type Row = {
    id: string; index: number; heading: string; summary: string; narration: string | null; status: string; duration_sec: number;
    shots: { id: string; index: number; status: string; duration_sec: number | null; seed_image_key: string | null; thumbnail_key: string | null }[];
    dialogue_lines: { index: number; text: string }[] | null;
  };
  return ((data ?? []) as Row[]).map((r) => {
    const shots = [...r.shots].sort((a, b) => a.index - b.index);
    const first = shots.find((s) => s.thumbnail_key || s.seed_image_key);
    const line = [...(r.dialogue_lines ?? [])].sort((a, b) => a.index - b.index)[0]?.text ?? null;
    return {
      id: r.id, index: r.index, heading: r.heading, summary: r.summary, narration: r.narration, firstLine: line, status: r.status,
      durationSec: r.duration_sec || shots.reduce((n, s) => n + (s.duration_sec ?? 0), 0),
      frameKey: first?.thumbnail_key ?? first?.seed_image_key ?? null,
      shots: shots.map((s) => ({ id: s.id, index: s.index, status: s.status })),
    };
  });
}

/** Send a scene edit to the Director (the Director workspace's own path). Returns how many instructions went. */
export async function reviseLiveScene(projectId: string, scene: LiveScene, draft: SceneDraft): Promise<number> {
  const msgs = sceneInstructions(scene, draft);
  for (const m of msgs) await sendInstruction(projectId, m);
  return msgs.length;
}

export interface LiveState {
  chat: ChatMessage[] | null;
  edits: EditRequestRow[];
  /** What the advert ran without or claims beyond its facts (A2/A3 codes first). */
  flags: DegradationRow[];
}

const AD_CODES = new Set(["CLAIM_UNSUPPORTED", "BRAND_ASSET_UNUSED", "BRAND_OUTRO_SKIPPED", "REFERENCE_STILL_UNCONDITIONED", "SEED_IMAGE_UNAVAILABLE"]);

export async function loadLiveState(projectId: string): Promise<LiveState> {
  const [chat, edits, gaps] = await Promise.all([loadConversation(projectId), listEditRequests(projectId), loadDegradations(projectId)]);
  return { chat, edits, flags: gaps.filter((g) => AD_CODES.has(g.code)) };
}
