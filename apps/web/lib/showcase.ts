import { getSupabase } from "./supabase";
import { signedUrl } from "./storyboard";

/** Homepage showcase — admin-curated real films, publicly viewable. */

export interface ShowcaseRow {
  id: string;
  title: string;
  tag: string;
  video_path: string;
  project_id: string | null;
}

const PUBLIC_BUCKET = "cineforge-public";

export function publicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`;
}

export async function listShowcase(limit = 6): Promise<ShowcaseRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("showcase").select("id,title,tag,video_path,project_id").order("created_at", { ascending: false }).limit(limit);
  return (data as ShowcaseRow[] | null) ?? [];
}

/** Admin: copy a private film into the public bucket + add it to the showcase. */
export async function featureFilm(projectId: string, mp4Key: string, title: string, tag = "Film"): Promise<void> {
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
  const ins = await sb.from("showcase").insert({ project_id: projectId, title, tag, video_path: path });
  if (ins.error && !ins.error.message.includes("duplicate")) throw new Error(ins.error.message);
}

/** Admin: remove from the showcase (and the public bucket). */
export async function unfeature(row: ShowcaseRow): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("showcase").delete().eq("id", row.id);
  await sb.storage.from(PUBLIC_BUCKET).remove([row.video_path]);
}
