/**
 * Locks and versions (DirectorOS W8; migrations 0029, 0037). Read and written
 * through an untyped client like the truth tables: the database enforces the
 * rules (only finished scenes lock; a locked scene or film is frozen), so the
 * client only asks and shows the database's answer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

const untyped = (): SupabaseClient | null => getSupabase() as unknown as SupabaseClient | null;

export interface LockScene {
  id: string;
  index: number;
  heading: string;
  lockedAt: string | null;
  shots: number;
  ready: number;
  /** Clip versions recorded across the scene's shots. */
  versions: number;
}

export interface MasterVersion {
  version: number;
  storageKey: string;
  createdAt: string;
  durationSec: number | null;
}

export interface ProductionLocks {
  filmLockedAt: string | null;
  scenes: LockScene[];
  masters: MasterVersion[];
}

export async function loadProductionLocks(projectId: string): Promise<ProductionLocks | null> {
  const sb = untyped();
  if (!sb) return null;
  const [project, scenes] = await Promise.all([
    sb.from("projects").select("locked_at").eq("id", projectId).maybeSingle(),
    sb.from("scenes").select("id,index,heading,locked_at,shots(id,status,video_key)").eq("project_id", projectId).order("index"),
  ]);
  if (project.error || scenes.error) return null; // before 0037: no lock columns yet
  const rows = (scenes.data ?? []) as { id: string; index: number; heading: string; locked_at: string | null; shots: { id: string; status: string; video_key: string | null }[] }[];
  const shotIds = rows.flatMap((r) => r.shots.map((s) => s.id));
  const [clipVersions, masters] = await Promise.all([
    shotIds.length
      ? sb.from("media_versions").select("asset_id").eq("project_id", projectId).eq("asset_type", "video")
      : Promise.resolve({ data: [], error: null }),
    sb.from("media_versions").select("version,storage_key,created_at,duration_us").eq("project_id", projectId).eq("asset_type", "master").order("version", { ascending: false }),
  ]);
  const perShot = new Map<string, number>();
  for (const v of (clipVersions.data ?? []) as { asset_id: string }[]) perShot.set(v.asset_id, (perShot.get(v.asset_id) ?? 0) + 1);
  return {
    filmLockedAt: (project.data as { locked_at: string | null } | null)?.locked_at ?? null,
    scenes: rows.map((r) => ({
      id: r.id,
      index: r.index,
      heading: r.heading,
      lockedAt: r.locked_at,
      shots: r.shots.length,
      ready: r.shots.filter((s) => s.status === "READY" && s.video_key).length,
      versions: r.shots.reduce((n, s) => n + (perShot.get(s.id) ?? 0), 0),
    })),
    masters: ((masters.data ?? []) as { version: number; storage_key: string; created_at: string; duration_us: number | null }[]).map((m) => ({
      version: m.version, storageKey: m.storage_key, createdAt: m.created_at, durationSec: m.duration_us === null ? null : m.duration_us / 1e6,
    })),
  };
}

/** Lock or unlock a scene; the database refuses an unfinished scene or a scene in a locked film. */
export async function setSceneLock(sceneId: string, locked: boolean): Promise<void> {
  const sb = untyped();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("scenes").update({ locked_at: locked ? new Date().toISOString() : null }).eq("id", sceneId);
  if (error) throw new Error(error.message);
}

/** Lock or unlock the whole film; the database refuses while any shot is unfinished. */
export async function setFilmLock(projectId: string, locked: boolean): Promise<void> {
  const sb = untyped();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("projects").update({ locked_at: locked ? new Date().toISOString() : null }).eq("id", projectId);
  if (error) throw new Error(error.message);
}
