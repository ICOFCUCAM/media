"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import type { Database, SceneStatus, ShotSource } from "./database.types";
import { EMPTY_BRIDGE, type SceneBridge, type StatePatch, type SceneInput } from "./continuity";

export type { SceneBridge } from "./continuity";
export { computeContinuity, renderStatePreamble, type SceneContinuity, type ProjectState } from "./continuity";

export type SceneRow = Database["public"]["Tables"]["scenes"]["Row"];
export type ShotRow = Database["public"]["Tables"]["shots"]["Row"];

const BUCKET = "cineforge-assets";

// Professional camera + scoring vocabulary surfaced in the scene card.
export const CAMERA_TYPES = ["Wide", "Medium", "Close-Up", "POV", "Drone", "Tracking", "Crane", "Handheld"] as const;
export const CAMERA_MOVEMENTS = ["Static", "Dolly", "Orbit", "Push-In", "Pull-Out"] as const;
export const MUSIC_STYLES = ["None", "Epic", "Tense", "Uplifting", "Somber", "Ambient", "Playful"] as const;
export const CLIP_DURATIONS = [5, 10, 15, 30, 60] as const;

/** A scene as edited in the storyboard UI — a complete production object that
 *  mirrors a scenes row + its lead shot (camera/seed/reference-video). */
export interface SceneDraft {
  key: string; // stable client key
  sceneId?: string;
  shotId?: string;
  index: number;
  heading: string;
  script: string; // scene prompt
  // Bible references (from the user's Library).
  character: string; // character name
  world: string; // world name
  // Workbench fields.
  dialogue: string;
  narration: string;
  location: string;
  mood: string;
  musicStyle: string;
  // Camera plan.
  cameraType: string;
  movement: string;
  // Continuity Engine — the state this scene changes + the bridge to the next.
  health: string; // character health/injuries that must carry forward
  season: string; // world season (winter can't become summer later)
  locationStatus: string; // e.g. "destroyed" — a destroyed place can't reappear intact
  goal: string; // the character's current goal
  bridge: SceneBridge;
  // Sources.
  source: ShotSource;
  seedKey: string | null; // storage key of the seed frame
  seedUrl: string | null; // signed URL for preview
  refVideoKey: string | null; // uploaded reference video (motion style)
  refVideoName: string | null;
  durationSec: number;
  status: SceneStatus;
}

let _k = 0;
export function newDraft(index: number, heading = "", script = ""): SceneDraft {
  return {
    key: `d${++_k}`,
    index,
    heading: heading || `Scene ${index + 1}`,
    script,
    character: "",
    world: "",
    dialogue: "",
    narration: "",
    location: "",
    mood: "",
    musicStyle: "None",
    cameraType: "",
    movement: "",
    health: "",
    season: "",
    locationStatus: "",
    goal: "",
    bridge: { ...EMPTY_BRIDGE },
    source: "text",
    seedKey: null,
    seedUrl: null,
    refVideoKey: null,
    refVideoName: null,
    durationSec: 5,
    status: "PENDING",
  };
}

/**
 * Deterministic local scene plan for the preview — in production the Director
 * (Claude) returns this. Splits a brief into beats so the creator has something
 * to edit rather than a blank page.
 */
export function draftScenesFromBrief(brief: string, count: number): SceneDraft[] {
  const beats = [
    "Establishing shot — set the world and tone",
    "Introduce the protagonist and their goal",
    "Inciting incident disrupts the status quo",
    "Rising tension and a complication",
    "Midpoint turn — the stakes escalate",
    "Setback — things fall apart",
    "Climax — the decisive confrontation",
    "Resolution — the new normal",
  ];
  const subject = brief.trim().split(/[.,\n]/)[0]?.slice(0, 80) || "the story";
  return Array.from({ length: count }, (_, i) =>
    newDraft(i, beats[i % beats.length], `${beats[i % beats.length]} for ${subject}.`),
  );
}

export async function createStoryboardProject(input: {
  title: string;
  brief: string;
  totalSeconds: number;
}): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data: auth } = await sb.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in");
  const { data, error } = await sb
    .from("projects")
    .insert({
      user_id: userId,
      title: input.title.slice(0, 60) || "Untitled storyboard",
      prompt: input.brief,
      target_seconds: input.totalSeconds,
      mode: "storyboard",
      status: "PLANNING",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Build this scene's state_patch (what it changes about the world) from the
 *  editable fields, so the Continuity Engine can fold it forward. */
export function buildStatePatch(d: SceneDraft): StatePatch {
  const patch: StatePatch = {};
  if (d.character) {
    const attrs: Record<string, string> = {};
    if (d.mood) attrs.emotion = d.mood;
    if (d.health) attrs.health = d.health;
    if (Object.keys(attrs).length) patch.characters = { [d.character]: attrs };
    if (d.goal) patch.goals = { [d.character]: d.goal };
  }
  if (d.location && d.locationStatus) patch.locations = { [d.location]: d.locationStatus };
  if (d.season) patch.world = { season: d.season };
  return patch;
}

function bridgeOrNull(b: SceneBridge): SceneBridge | null {
  return Object.values(b).some((v) => v.trim()) ? b : null;
}

function patchOrNull(p: StatePatch): StatePatch | null {
  return Object.keys(p).length ? p : null;
}

/** A draft as the Continuity Engine sees it. */
export function toSceneInput(d: SceneDraft): SceneInput {
  return {
    index: d.index,
    heading: d.heading,
    characterRef: d.character || null,
    worldRef: d.world || null,
    locationRef: d.location || null,
    statePatch: patchOrNull(buildStatePatch(d)),
    bridge: bridgeOrNull(d.bridge),
  };
}

/** Insert (or update) a scene + its lead shot, returning the persisted ids.
 *  `meta` carries the folded continuity (score + dependencies) for this scene. */
export async function persistScene(
  projectId: string,
  d: SceneDraft,
  meta?: { continuityScore?: number; dependsOn?: number[] },
): Promise<{ sceneId: string; shotId: string }> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  const seedSafe = d.seedKey && !/^(generated:|local:|ref:)/.test(d.seedKey) ? d.seedKey : null;
  const sceneFields = {
    index: d.index,
    heading: d.heading,
    summary: d.script,
    dialogue: d.dialogue || null,
    narration: d.narration || null,
    camera: [d.cameraType, d.movement].filter(Boolean).join(" · ") || null,
    location_note: d.location || null,
    mood: d.mood || null,
    music: d.musicStyle && d.musicStyle !== "None" ? d.musicStyle : null,
    character_ref: d.character || null,
    world_ref: d.world || null,
    bridge: bridgeOrNull(d.bridge) as unknown as Database["public"]["Tables"]["scenes"]["Insert"]["bridge"],
    state_patch: patchOrNull(buildStatePatch(d)) as unknown as Database["public"]["Tables"]["scenes"]["Insert"]["state_patch"],
    depends_on: meta?.dependsOn ?? [],
    continuity_score: meta?.continuityScore ?? null,
    duration_sec: d.durationSec,
  };

  let sceneId = d.sceneId;
  if (sceneId) {
    await sb.from("scenes").update(sceneFields).eq("id", sceneId);
  } else {
    const { data, error } = await sb
      .from("scenes")
      .insert({ project_id: projectId, ...sceneFields })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    sceneId = data.id;
  }

  const shotFields = {
    prompt: d.script,
    source: d.source,
    seed_image_key: seedSafe,
    camera_type: d.cameraType || null,
    camera_movement: d.movement || null,
    reference_video_key: d.refVideoKey,
  };
  let shotId = d.shotId;
  if (shotId) {
    await sb.from("shots").update(shotFields).eq("id", shotId);
  } else {
    const { data, error } = await sb
      .from("shots")
      .insert({ scene_id: sceneId, index: 0, duration_sec: d.durationSec, ...shotFields })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    shotId = data.id;
  }
  return { sceneId, shotId };
}

/** Upload a creator-provided asset (seed frame or reference video) to storage. */
export async function uploadAsset(
  projectId: string,
  sceneKey: string,
  file: File,
  kind: "seeds" | "refvideo",
): Promise<{ key: string; url: string }> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const ext = file.name.split(".").pop()?.toLowerCase() || (kind === "refvideo" ? "mp4" : "png");
  const key = `projects/${projectId}/${kind}/${sceneKey}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(key, file, { upsert: true });
  if (error) throw new Error(error.message);
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(key, 3600);
  return { key, url: data?.signedUrl ?? "" };
}

/** Back-compat alias for the seed-frame uploader. */
export const uploadSeedImage = (projectId: string, sceneKey: string, file: File) =>
  uploadAsset(projectId, sceneKey, file, "seeds");

export async function signedUrl(key: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(key, 3600);
  return data?.signedUrl ?? null;
}

/** Live per-scene status for the open project (Postgres Changes via Realtime). */
export function subscribeScenes(projectId: string, onChange: (row: SceneRow) => void): RealtimeChannel | null {
  const sb = getSupabase();
  if (!sb) return null;
  return sb
    .channel(`scenes:${projectId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "scenes", filter: `project_id=eq.${projectId}` },
      (payload) => {
        if (payload.new && "id" in payload.new) onChange(payload.new as SceneRow);
      },
    )
    .subscribe();
}

/**
 * Worker stand-in for a single scene: walks scene + shot statuses through
 * GENERATING -> READY by WRITING to Supabase. The UI reflects these only after
 * they round-trip via Realtime. apps/worker does the same writes after the GPU
 * (text-to-video or image-to-video) job and QC.
 */
export function generateScene(sceneId: string, shotId: string): { cancel: () => void } {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cancelled = false;
  const sb = getSupabase();
  const at = (ms: number, fn: () => void) => timers.push(setTimeout(() => !cancelled && fn(), ms));

  if (sb) {
    sb.from("scenes").update({ status: "GENERATING" }).eq("id", sceneId);
    sb.from("shots").update({ status: "GENERATING" }).eq("id", shotId);
    at(2200 + Math.random() * 1500, async () => {
      await sb.from("shots").update({ status: "READY" }).eq("id", shotId);
      await sb.from("scenes").update({ status: "READY" }).eq("id", sceneId);
    });
  }
  return {
    cancel: () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    },
  };
}

/** Mark the project rendered + write the film row once all scenes are READY. */
export async function assembleStoryboard(projectId: string, totalSeconds: number): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("projects").update({ status: "RENDERING", progress: 0.9 }).eq("id", projectId);
  await sb.from("films").insert({
    project_id: projectId,
    duration_sec: totalSeconds,
    mp4_key: `projects/${projectId}/film/final.mp4`,
  });
  await sb.from("projects").update({ status: "READY", progress: 1 }).eq("id", projectId);
}
