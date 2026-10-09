"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import type { Database, ProjectStatus } from "./database.types";
import type { ProductionSpec } from "./production-types";

export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
export type FilmRow = Database["public"]["Tables"]["films"]["Row"];

/** Insert a project owned by the current user. RLS enforces user_id = auth.uid(). */
export async function createProject(input: {
  title: string;
  prompt: string;
  targetSeconds: number;
  modelId: string;
  estimatedMs: number;
  resolution?: string;
  aspectRatio?: string;
  passMode?: "single" | "three";
  /** What is being made (W11): format, medium, animation style, episodes. */
  production?: ProductionSpec;
  /** Character Cards to cast (W12): attached before the worker can claim the project. */
  castIds?: string[];
}): Promise<ProjectRow> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data: auth } = await sb.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in");

  const { data, error } = await sb
    .from("projects")
    .insert({
      user_id: userId,
      title: input.title,
      prompt: input.prompt,
      ...(input.resolution ? { resolution: input.resolution } : {}),
      ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
      ...(input.passMode === "three" ? { pass_mode: "three" as const } : {}),
      ...(input.production
        ? {
            kind: input.production.kind, medium: input.production.medium, animation_style: input.production.animationStyle,
            episodes: input.production.episodes ?? null,
            series_id: input.production.seriesId ?? null, episode_number: input.production.episodeNumber ?? null,
          }
        : {}),
      target_seconds: input.targetSeconds,
      model_id: input.modelId,
      estimated_ms: input.estimatedMs,
      // With a cast, the project waits as DRAFT until its cards are attached: the
      // worker claims PLANNING projects and must never plan without the cast.
      status: input.castIds?.length ? "DRAFT" : "PLANNING",
      progress: 0,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  if (!input.castIds?.length) return data;

  const { error: castErr } = await sb.from("project_cast").insert(input.castIds.map((character_id) => ({ project_id: data.id, character_id })));
  if (castErr) {
    await sb.from("projects").update({ status: "FAILED", error_message: `Casting failed: ${castErr.message}` }).eq("id", data.id);
    throw new Error(castErr.message);
  }
  const { data: queued, error: qErr } = await sb.from("projects").update({ status: "PLANNING" }).eq("id", data.id).select().single();
  if (qErr) throw new Error(qErr.message);
  return queued;
}

/** Worker-side write: advance a project's status/progress. */
export async function updateProject(
  id: string,
  patch: { status?: ProjectStatus; progress?: number; spent_ms?: number; error_message?: string | null },
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("projects").update(patch).eq("id", id);
}

/** Worker-side write: record the finished film. */
export async function insertFilm(input: {
  projectId: string;
  durationSec: number;
  mp4Key: string;
  hlsKey?: string;
}): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("films").insert({
    project_id: input.projectId,
    duration_sec: input.durationSec,
    mp4_key: input.mp4Key,
    hls_key: input.hlsKey ?? null,
  });
}

export async function listProjects(limit = 8): Promise<ProjectRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("projects")
    .select()
    .neq("mode", "library") // hide the reusable-asset container
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

/** Subscribe to live changes for one project (Postgres Changes via Realtime). */
export function subscribeProject(id: string, onChange: (row: ProjectRow) => void): RealtimeChannel | null {
  const sb = getSupabase();
  if (!sb) return null;
  const channel = sb
    .channel(`project:${id}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "projects", filter: `id=eq.${id}` },
      (payload) => onChange(payload.new as ProjectRow),
    )
    .subscribe();
  return channel;
}

/**
 * Real poster frames for finished projects — the render engine stores one
 * per film (films.poster_key). Returns project id → short-lived signed URL;
 * projects without a finished film are simply absent (callers draw a frame).
 */
export async function posterUrls(projectIds: string[]): Promise<Record<string, string>> {
  const sb = getSupabase();
  if (!sb || projectIds.length === 0) return {};
  const { data } = await sb.from("films").select("project_id, poster_key").in("project_id", projectIds).not("poster_key", "is", null);
  const rows = (data ?? []).filter((r): r is { project_id: string; poster_key: string } => !!r.poster_key);
  if (rows.length === 0) return {};
  const { data: signed } = await sb.storage.from("cineforge-assets").createSignedUrls(rows.map((r) => r.poster_key), 3600);
  const out: Record<string, string> = {};
  rows.forEach((r, i) => {
    const url = signed?.[i]?.signedUrl;
    if (url) out[r.project_id] = url;
  });
  return out;
}
