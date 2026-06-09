"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import type { Database, ProjectStatus } from "./database.types";

export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
export type FilmRow = Database["public"]["Tables"]["films"]["Row"];

/** Insert a project owned by the current user. RLS enforces user_id = auth.uid(). */
export async function createProject(input: {
  title: string;
  prompt: string;
  targetSeconds: number;
  modelId: string;
  estimatedMs: number;
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
      target_seconds: input.targetSeconds,
      model_id: input.modelId,
      estimated_ms: input.estimatedMs,
      status: "PLANNING",
      progress: 0,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
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
