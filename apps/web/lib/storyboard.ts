"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import type { Database, SceneStatus, ShotSource } from "./database.types";

export type SceneRow = Database["public"]["Tables"]["scenes"]["Row"];
export type ShotRow = Database["public"]["Tables"]["shots"]["Row"];

const BUCKET = "cineforge-assets";

/** A scene as edited in the storyboard UI (mirrors a scenes row + its lead shot). */
export interface SceneDraft {
  key: string; // stable client key
  sceneId?: string;
  shotId?: string;
  index: number;
  heading: string;
  script: string;
  source: ShotSource;
  seedKey: string | null; // storage key of the seed frame
  seedUrl: string | null; // signed URL for preview
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
    source: "text",
    seedKey: null,
    seedUrl: null,
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

/** Insert (or update) a scene + its lead shot, returning the persisted ids. */
export async function persistScene(projectId: string, d: SceneDraft): Promise<{ sceneId: string; shotId: string }> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");

  let sceneId = d.sceneId;
  if (sceneId) {
    await sb
      .from("scenes")
      .update({ index: d.index, heading: d.heading, summary: d.script, duration_sec: d.durationSec })
      .eq("id", sceneId);
  } else {
    const { data, error } = await sb
      .from("scenes")
      .insert({ project_id: projectId, index: d.index, heading: d.heading, summary: d.script, duration_sec: d.durationSec })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    sceneId = data.id;
  }

  let shotId = d.shotId;
  if (shotId) {
    await sb
      .from("shots")
      .update({ prompt: d.script, source: d.source, seed_image_key: d.seedKey })
      .eq("id", shotId);
  } else {
    const { data, error } = await sb
      .from("shots")
      .insert({
        scene_id: sceneId,
        index: 0,
        prompt: d.script,
        source: d.source,
        seed_image_key: d.seedKey,
        duration_sec: d.durationSec,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    shotId = data.id;
  }
  return { sceneId, shotId };
}

/** Upload a creator-provided seed frame to the project's storage prefix. */
export async function uploadSeedImage(
  projectId: string,
  sceneKey: string,
  file: File,
): Promise<{ key: string; url: string }> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const key = `projects/${projectId}/seeds/${sceneKey}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(key, file, { upsert: true });
  if (error) throw new Error(error.message);
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(key, 3600);
  return { key, url: data?.signedUrl ?? "" };
}

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
