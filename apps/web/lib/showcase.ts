import { getSupabase } from "./supabase";
import { signedUrl } from "./storyboard";

/** Homepage showcase — admin-curated real films, publicly viewable. */

/** The homepage frames a featured film can fill (docs/76): the hero and the six showreel frames. */
export const SHOWCASE_SLOTS = ["hero", "work-1", "work-2", "work-3", "work-4", "work-5", "work-6"] as const;
export type ShowcaseSlot = (typeof SHOWCASE_SLOTS)[number];
export const REEL_SLOTS = SHOWCASE_SLOTS.slice(1) as Exclude<ShowcaseSlot, "hero">[];

export interface ShowcaseRow {
  id: string;
  title: string;
  tag: string;
  video_path: string;
  project_id: string | null;
  slot: ShowcaseSlot | null;
}

const PUBLIC_BUCKET = "cineforge-public";

export function publicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`;
}

export async function listShowcase(limit = 6): Promise<ShowcaseRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("showcase").select("id,title,tag,video_path,project_id,slot").order("created_at", { ascending: false }).limit(limit);
  return (data as ShowcaseRow[] | null) ?? [];
}

/**
 * The six showreel frames: a film featured for a frame fills it; films
 * featured without a frame fill the frames still empty, newest first; the
 * rest stay placeholders (null).
 */
export function arrangeReel(rows: ShowcaseRow[]): (ShowcaseRow | null)[] {
  const bySlot = new Map(rows.filter((r) => r.slot).map((r) => [r.slot, r]));
  const loose = rows.filter((r) => !r.slot);
  return REEL_SLOTS.map((s) => bySlot.get(s) ?? loose.shift() ?? null);
}

/** The hero film: the one featured for the hero, else the newest film featured without a frame. */
export function heroFilm(rows: ShowcaseRow[]): ShowcaseRow | null {
  return rows.find((r) => r.slot === "hero") ?? rows.find((r) => !r.slot) ?? null;
}

/**
 * Admin: copy a private film into the public bucket and add it to the
 * showcase. With a slot, it replaces whatever film filled that frame.
 */
export async function featureFilm(projectId: string, mp4Key: string, title: string, tag = "Film", slot: ShowcaseSlot | null = null): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const src = await signedUrl(mp4Key);
  if (!src) throw new Error("could not sign the film for copying");
  const res = await fetch(src);
  if (!res.ok) throw new Error(`film download ${res.status}`);
  const blob = await res.blob();
  const path = `showcase/${projectId}.mp4`;
  const up = await sb.storage.from(PUBLIC_BUCKET).upload(path, blob, { upsert: true, contentType: "video/mp4" });
  if (up.error) throw new Error(up.error.message);
  if (slot) {
    // The film leaving the frame, and any earlier showcase row of this film.
    const { data: old } = await sb.from("showcase").select("id,title,tag,video_path,project_id,slot").or(`slot.eq.${slot},project_id.eq.${projectId}`);
    for (const row of (old as ShowcaseRow[] | null) ?? []) await unfeature(row, path);
  }
  const ins = await sb.from("showcase").insert({ project_id: projectId, title, tag, video_path: path, slot });
  if (ins.error && !ins.error.message.includes("duplicate")) throw new Error(ins.error.message);
}

/** Admin: remove from the showcase (and its file from the public bucket, unless it is still used). */
export async function unfeature(row: ShowcaseRow, keepPath?: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("showcase").delete().eq("id", row.id);
  if (row.video_path !== keepPath) await sb.storage.from(PUBLIC_BUCKET).remove([row.video_path]);
}

/** A film made for a homepage frame (projects.showcase_slot), waiting for an admin's decision. */
export interface SlotCandidate {
  projectId: string;
  title: string;
  slot: ShowcaseSlot;
  status: string;
  updatedAt: string;
  mp4Key: string | null;
  errorMessage: string | null;
}

/** Admin: every film made for a homepage frame, newest first, with its finished file when there is one. */
export async function listSlotCandidates(): Promise<SlotCandidate[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("projects")
    .select("id,title,showcase_slot,status,updated_at,error_message,films(mp4_key)")
    .not("showcase_slot", "is", null)
    .order("updated_at", { ascending: false })
    .limit(60);
  type Row = { id: string; title: string; showcase_slot: ShowcaseSlot; status: string; updated_at: string; error_message: string | null; films: { mp4_key: string | null }[] | { mp4_key: string | null } | null };
  return ((data as Row[] | null) ?? []).map((r) => {
    const film = Array.isArray(r.films) ? r.films[0] : r.films;
    return { projectId: r.id, title: r.title, slot: r.showcase_slot, status: r.status, updatedAt: r.updated_at, mp4Key: film?.mp4_key ?? null, errorMessage: r.error_message };
  });
}
