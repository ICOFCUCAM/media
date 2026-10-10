/**
 * The Animation Studio's data (W12; Part 5 §179–185): Character Cards,
 * shows with their Show Bible and cast, and episode numbering. Everything is
 * the owner's own rows under RLS; the worker reads the same rows when it
 * plans (apps/worker/src/director/studio.ts).
 */
import type { Database, Json } from "./database.types";
import { getSupabase } from "./supabase";
import type { AnimationStyle } from "./production-types";

export type CardRow = Database["public"]["Tables"]["characters"]["Row"];
export type BibleRow = Database["public"]["Tables"]["show_bibles"]["Row"];

/** Ask the server to draw (or redraw) a card's portrait (W21; 0054). */
export async function requestPortrait(cardId: string): Promise<void> {
  const { error } = await client().from("characters").update({ portrait_status: "requested" }).eq("id", cardId);
  if (error) throw new Error(error.message);
}

export interface CardDesign {
  proportions: string;
  palette: string;
  movement: string;
}

export interface CardInput {
  name: string;
  appearance: string;
  age?: number | null;
  gender?: string | null;
  heightCm?: number | null;
  hair?: string | null;
  eyes?: string | null;
  clothing?: string | null;
  personality?: string | null;
  animationStyle?: AnimationStyle | null;
  design?: CardDesign | null;
  /** A cloned or chosen voice from the Voice Engine (voices.id). */
  voiceId?: string | null;
  voiceDescription?: string | null;
}

function client() {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  return sb;
}

async function userId(): Promise<string> {
  const { data } = await client().auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

/** The owner's Library container (projects.mode = 'library'), created on first use. */
async function libraryId(): Promise<string> {
  const sb = client();
  const { data: existing } = await sb.from("projects").select("id").eq("mode", "library").limit(1).maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await sb
    .from("projects")
    .insert({ user_id: await userId(), title: "Library", prompt: "(reusable assets)", target_seconds: 0, mode: "library", status: "DRAFT" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

const clean = (s?: string | null) => (s?.trim() ? s.trim() : null);

/** A design is all three parts or none (the database checks the same). */
export function designOrNull(d?: Partial<CardDesign> | null): CardDesign | null {
  const p = clean(d?.proportions), c = clean(d?.palette), m = clean(d?.movement);
  return p && c && m ? { proportions: p, palette: c, movement: m } : null;
}

function cardColumns(c: CardInput) {
  const voice: Record<string, string> = {};
  if (c.voiceId) voice.voiceId = c.voiceId;
  if (clean(c.voiceDescription)) voice.description = clean(c.voiceDescription)!;
  return {
    name: c.name.trim(),
    appearance: c.appearance.trim(),
    age: c.age ?? null,
    gender: clean(c.gender),
    height_cm: c.heightCm ?? null,
    hair: clean(c.hair),
    eyes: clean(c.eyes),
    clothing: clean(c.clothing),
    personality: clean(c.personality),
    animation_style: c.animationStyle ?? null,
    design: (designOrNull(c.design) as unknown as Json) ?? null,
    voice_profile: (Object.keys(voice).length ? voice : null) as Json | null,
  };
}

/** Problems with a card before it is saved (empty = fine). */
export function cardIssues(c: CardInput): string[] {
  const out: string[] = [];
  if (!c.name.trim()) out.push("A character needs a name.");
  if (!c.appearance.trim()) out.push("Describe how they look.");
  if (c.heightCm != null && (c.heightCm < 20 || c.heightCm > 400)) out.push("Height is 20–400 cm.");
  if (c.age != null && (c.age < 0 || c.age > 130)) out.push("Age is 0–130.");
  const d = c.design;
  const parts = [d?.proportions, d?.palette, d?.movement].filter((x) => x?.trim()).length;
  if (parts > 0 && parts < 3) out.push("A design has proportions, colours and movement — fill all three or none.");
  return out;
}

/** The owner's Character Cards: the characters in their Library. */
export async function listCards(): Promise<CardRow[]> {
  const sb = client();
  const { data: lib } = await sb.from("projects").select("id").eq("mode", "library").limit(1).maybeSingle();
  if (!lib) return [];
  const { data, error } = await sb.from("characters").select().eq("project_id", lib.id).order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCard(c: CardInput): Promise<CardRow> {
  const issues = cardIssues(c);
  if (issues.length) throw new Error(issues.join(" "));
  const { voice_profile, ...cols } = cardColumns(c);
  const { data, error } = await client()
    .from("characters")
    .insert({ project_id: await libraryId(), ...cols })
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (voice_profile) {
    const { error: vErr } = await client().from("characters").update({ voice_profile }).eq("id", data.id);
    if (vErr) throw new Error(vErr.message);
    return { ...data, voice_profile };
  }
  return data;
}

export async function updateCard(id: string, c: CardInput): Promise<void> {
  const issues = cardIssues(c);
  if (issues.length) throw new Error(issues.join(" "));
  const { error } = await client().from("characters").update(cardColumns(c)).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Every production a card was cast in (its copies point back at it). */
export async function cardAppearances(cardId: string): Promise<{ projectId: string; title: string }[]> {
  const { data } = await client().from("characters").select("project_id, projects(title)").eq("source_character_id", cardId);
  const rows = (data ?? []) as unknown as { project_id: string; projects: { title: string } | null }[];
  return rows.map((r) => ({ projectId: r.project_id, title: r.projects?.title ?? "Untitled" }));
}

/* ── Shows ─────────────────────────────────────────────────── */

export interface Show {
  seriesId: string;
  projectId: string;
  title: string;
  synopsis: string | null;
  medium: "live_action" | "animation";
  animationStyle: string | null;
  bible: BibleRow | null;
  castIds: string[];
  /** Episode productions made so far, by number. */
  episodes: { projectId: string; number: number; season: number; title: string; status: string }[];
}

export interface BibleInput {
  genre?: string | null;
  audience?: string | null;
  worldRules?: string | null;
  locations?: string | null;
  musicIdentity?: string | null;
  narrativeRules?: string | null;
  episodeFormat?: string | null;
  continuityRules?: string | null;
}

function bibleColumns(b: BibleInput) {
  return {
    genre: clean(b.genre), audience: clean(b.audience), world_rules: clean(b.worldRules), locations: clean(b.locations),
    music_identity: clean(b.musicIdentity), narrative_rules: clean(b.narrativeRules), episode_format: clean(b.episodeFormat),
    continuity_rules: clean(b.continuityRules),
  };
}

/** The season a show is in: that of its latest episode (W26). */
export function currentSeason(show: Pick<Show, "episodes">): number {
  return show.episodes.reduce((m, e) => (e.number >= m.number ? { number: e.number, season: e.season } : m), { number: 0, season: 1 }).season;
}

/** Episodes grouped by season, in order (W26). */
export function seasonsOf(show: Pick<Show, "episodes">): { season: number; episodes: Show["episodes"] }[] {
  const by = new Map<number, Show["episodes"]>();
  for (const e of [...show.episodes].sort((a, b) => a.number - b.number)) by.set(e.season, [...(by.get(e.season) ?? []), e]);
  return [...by.entries()].sort(([a], [b]) => a - b).map(([season, episodes]) => ({ season, episodes }));
}

/** The next episode a show makes: one after the highest made so far. */
export function nextEpisodeNumber(show: Pick<Show, "episodes">): number {
  return show.episodes.reduce((m, e) => Math.max(m, e.number), 0) + 1;
}

export async function listShows(): Promise<Show[]> {
  const sb = client();
  const { data: shows, error } = await sb
    .from("projects")
    .select("id, title, prompt, medium, animation_style")
    .eq("mode", "show")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!shows?.length) return [];
  const ids = shows.map((s) => s.id);
  const [{ data: series }, { data: cast }] = await Promise.all([
    sb.from("series").select().in("project_id", ids),
    sb.from("project_cast").select().in("project_id", ids),
  ]);
  const seriesIds = (series ?? []).map((s) => s.id);
  const [{ data: bibles }, { data: episodes }] = await Promise.all([
    seriesIds.length ? sb.from("show_bibles").select().in("series_id", seriesIds) : Promise.resolve({ data: [] as BibleRow[] }),
    seriesIds.length
      ? sb.from("projects").select("id, title, status, series_id, episode_number, season_number").in("series_id", seriesIds).order("episode_number", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; title: string; status: string; series_id: string | null; episode_number: number | null; season_number: number | null }[] }),
  ]);
  return shows.flatMap((p) => {
    const s = (series ?? []).find((x) => x.project_id === p.id);
    if (!s) return [];
    return [{
      seriesId: s.id,
      projectId: p.id,
      title: s.title,
      synopsis: s.synopsis ?? clean(p.prompt),
      medium: p.medium,
      animationStyle: p.animation_style,
      bible: (bibles ?? []).find((b) => b.series_id === s.id) ?? null,
      castIds: (cast ?? []).filter((c) => c.project_id === p.id).map((c) => c.character_id),
      episodes: (episodes ?? [])
        .filter((e) => e.series_id === s.id && e.episode_number != null)
        .map((e) => ({ projectId: e.id, number: e.episode_number!, season: e.season_number ?? 1, title: e.title, status: e.status })),
    }];
  });
}

/** A new show: its container (never made itself), series row, bible and cast. */
export async function createShow(input: {
  title: string;
  synopsis?: string | null;
  animationStyle: AnimationStyle | null;
  bible: BibleInput;
  castIds: string[];
}): Promise<string> {
  const sb = client();
  if (!input.title.trim()) throw new Error("A show needs a title.");
  const { data: project, error } = await sb
    .from("projects")
    .insert({
      user_id: await userId(),
      title: input.title.trim(),
      prompt: clean(input.synopsis) ?? input.title.trim(),
      target_seconds: 0,
      mode: "show",
      status: "DRAFT",
      kind: "series",
      medium: input.animationStyle ? "animation" : "live_action",
      animation_style: input.animationStyle,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const { data: series, error: sErr } = await sb
    .from("series")
    .insert({ project_id: project.id, title: input.title.trim(), synopsis: clean(input.synopsis) })
    .select("id")
    .single();
  if (sErr) throw new Error(sErr.message);
  const { error: bErr } = await sb.from("show_bibles").insert({ series_id: series.id, ...bibleColumns(input.bible) });
  if (bErr) throw new Error(bErr.message);
  if (input.castIds.length) {
    const { error: cErr } = await sb.from("project_cast").insert(input.castIds.map((character_id) => ({ project_id: project.id, character_id })));
    if (cErr) throw new Error(cErr.message);
  }
  return series.id;
}

export async function saveBible(seriesId: string, bible: BibleInput): Promise<void> {
  const { error } = await client()
    .from("show_bibles")
    .update({ ...bibleColumns(bible), updated_at: new Date().toISOString() })
    .eq("series_id", seriesId);
  if (error) throw new Error(error.message);
}

/** Replace a show's cast (the cards every episode is made with). */
export async function setShowCast(showProjectId: string, castIds: string[]): Promise<void> {
  const sb = client();
  const { error } = await sb.from("project_cast").delete().eq("project_id", showProjectId);
  if (error) throw new Error(error.message);
  if (castIds.length) {
    const { error: iErr } = await sb.from("project_cast").insert(castIds.map((character_id) => ({ project_id: showProjectId, character_id })));
    if (iErr) throw new Error(iErr.message);
  }
}
