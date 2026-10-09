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

/* ── Passes (W8b, 0040): STORY → PREVIS → FINAL ─────────────────────────── */

export interface PassScene {
  id: string;
  index: number;
  heading: string;
  summary: string;
  narration: string | null;
  approvedAt: string | null;
  stills: string[];
  shots: number;
  ready: number;
  /** Per shot: its still and, when several were drawn, the other takes (W17). */
  takes: ShotStills[];
}

export interface ShotStills {
  shotId: string;
  index: number;
  still: string | null;
  hasVideo: boolean;
  candidates: { id: string; key: string; chosen: boolean }[];
}

export interface PassState {
  passMode: "single" | "three";
  storyApprovedAt: string | null;
  status: string;
  scenes: PassScene[];
}

export async function loadPasses(projectId: string): Promise<PassState | null> {
  const sb = untyped();
  if (!sb) return null;
  const [project, scenes, cands] = await Promise.all([
    sb.from("projects").select("pass_mode,story_approved_at,status").eq("id", projectId).maybeSingle(),
    sb.from("scenes").select("id,index,heading,summary,narration,storyboard_approved_at,shots(id,index,seed_image_key,status,video_key)").eq("project_id", projectId).order("index"),
    // Seed candidates (W17, 0052); absent before the migration.
    sb.from("image_generations").select("id,subject,storage_key,candidate,chosen").eq("project_id", projectId).eq("purpose", "seed_candidate").order("candidate"),
  ]);
  const takesBy = new Map<string, { id: string; key: string; chosen: boolean }[]>();
  for (const c of ((cands.error ? [] : cands.data) ?? []) as { id: string; subject: string; storage_key: string; chosen: boolean | null }[]) {
    takesBy.set(c.subject, [...(takesBy.get(c.subject) ?? []), { id: c.id, key: c.storage_key, chosen: Boolean(c.chosen) }]);
  }
  if (project.error || scenes.error || !project.data) return null; // before 0040
  const p = project.data as { pass_mode: "single" | "three"; story_approved_at: string | null; status: string };
  const rows = (scenes.data ?? []) as { id: string; index: number; heading: string; summary: string; narration: string | null; storyboard_approved_at: string | null; shots: { id: string; index: number; seed_image_key: string | null; status: string; video_key: string | null }[] }[];
  return {
    passMode: p.pass_mode,
    storyApprovedAt: p.story_approved_at,
    status: p.status,
    scenes: rows.map((r) => ({
      id: r.id, index: r.index, heading: r.heading, summary: r.summary, narration: r.narration, approvedAt: r.storyboard_approved_at,
      stills: [...r.shots].sort((a, b) => a.index - b.index).map((s) => s.seed_image_key).filter((k): k is string => !!k),
      shots: r.shots.length,
      ready: r.shots.filter((s) => s.status === "READY" && s.video_key).length,
      takes: [...r.shots].sort((a, b) => a.index - b.index).map((s) => ({
        shotId: s.id, index: s.index, still: s.seed_image_key, hasVideo: !!s.video_key, candidates: takesBy.get(s.id) ?? [],
      })),
    })),
  };
}

/** Use a different candidate still for a shot that has no video yet (W17; the database checks ownership). */
export async function chooseTake(generationId: string): Promise<void> {
  const sb = untyped();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.rpc("choose_seed_candidate", { p_generation: generationId });
  if (error) throw new Error(error.message);
}

/** Approve (or withdraw) the story; the database refuses what the pass rules forbid. */
export async function setStoryApproved(projectId: string, approved: boolean): Promise<void> {
  const sb = untyped();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("projects").update({ story_approved_at: approved ? new Date().toISOString() : null }).eq("id", projectId);
  if (error) throw new Error(error.message);
}

/** Approve (or withdraw) a scene's storyboard: an approved scene generates video. */
export async function setStoryboardApproved(sceneId: string, approved: boolean): Promise<void> {
  const sb = untyped();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("scenes").update({ storyboard_approved_at: approved ? new Date().toISOString() : null }).eq("id", sceneId);
  if (error) throw new Error(error.message);
}

/* ── Edit requests (W8b, 0039) ──────────────────────────────────────────── */

export interface CanonCast {
  characters: { id: string; name: string; wardrobe: { id: string; description: string }[] }[];
  scenes: { id: string; index: number; heading: string }[];
}

/** The film's canon (Film IR) for the edit form; null for films planned before the IR. */
export async function loadCanon(projectId: string): Promise<CanonCast | null> {
  const sb = untyped();
  if (!sb) return null;
  const { data } = await sb.from("screenplays").select("raw").eq("project_id", projectId).maybeSingle();
  const pkg = (data as { raw?: { package?: { cast?: unknown[]; scenes?: unknown[] } } } | null)?.raw?.package;
  if (!pkg?.cast || !pkg.scenes) return null;
  return {
    characters: (pkg.cast as { id: string; name: string; wardrobe: { id: string; description: string }[] }[]).map((c) => ({ id: c.id, name: c.name, wardrobe: c.wardrobe ?? [] })),
    scenes: (pkg.scenes as { id: string; heading?: string; slugline?: string }[]).map((s, index) => ({ id: s.id, index, heading: s.heading ?? s.slugline ?? s.id })),
  };
}

export interface EditRequestRow {
  id: string;
  change: { kind: string } & Record<string, unknown>;
  status: "pending" | "applying" | "applied" | "rejected" | "failed";
  issues: { code: string; message: string }[];
  affected_shots: number | null;
  error: string | null;
  created_at: string;
}

export async function listEditRequests(projectId: string): Promise<EditRequestRow[]> {
  const sb = untyped();
  if (!sb) return [];
  const { data, error } = await sb.from("edit_requests").select("id,change,status,issues,affected_shots,error,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(20);
  return error ? [] : ((data ?? []) as EditRequestRow[]);
}

/** Ask for one canon change; the worker applies it and regenerates only what it touches. */
export async function requestEdit(projectId: string, change: Record<string, unknown>): Promise<void> {
  const sb = untyped();
  if (!sb) throw new Error("Supabase not configured");
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const { error } = await sb.from("edit_requests").insert({ project_id: projectId, requested_by: auth.user.id, change });
  if (error) throw new Error(error.message);
}

/** How many shots depend on an entity (dependency edges, 0041). */
export async function dependentShots(projectId: string, entityType: string, entityKey: string): Promise<number | null> {
  const sb = untyped();
  if (!sb) return null;
  const { count, error } = await sb.from("shot_dependencies").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("entity_type", entityType).eq("entity_key", entityKey);
  return error ? null : count ?? 0;
}

/* ── Takes (W8a/W8b): play an earlier clip, make it current ─────────────── */

export interface Take {
  version: number;
  storageKey: string;
  createdAt: string;
  current: boolean;
}

export interface ShotTakes {
  shotId: string;
  index: number;
  takes: Take[];
}

export async function loadTakes(sceneId: string, projectId: string): Promise<ShotTakes[]> {
  const sb = untyped();
  if (!sb) return [];
  const { data: shots } = await sb.from("shots").select("id,index,video_key").eq("scene_id", sceneId).order("index");
  const list = (shots ?? []) as { id: string; index: number; video_key: string | null }[];
  if (!list.length) return [];
  const { data: versions } = await sb.from("media_versions").select("asset_id,version,storage_key,created_at").eq("project_id", projectId).eq("asset_type", "video").in("asset_id", list.map((s) => s.id)).order("version", { ascending: false });
  const rows = (versions ?? []) as { asset_id: string; version: number; storage_key: string; created_at: string }[];
  return list.map((s) => ({
    shotId: s.id,
    index: s.index,
    takes: rows.filter((v) => v.asset_id === s.id).map((v) => ({ version: v.version, storageKey: v.storage_key, createdAt: v.created_at, current: v.storage_key === s.video_key })),
  }));
}

/** Point a shot back at an earlier take (refused by the database if its scene is locked). Re-assemble to hear and see it. */
export async function restoreTake(shotId: string, storageKey: string): Promise<void> {
  const sb = untyped();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("shots").update({ video_key: storageKey }).eq("id", shotId);
  if (error) throw new Error(error.message);
}
