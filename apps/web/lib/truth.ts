"use client";

/**
 * The truth layer, client side (DirectorOS W1; migration 0031).
 *
 *  - Capabilities: what the worker reports as actually operational (DOS-77).
 *    The UI offers only what is real (DOS-78). Until 0031 is applied, or when
 *    the worker has not published yet, the state is "unknown" and the UI says
 *    the options are unverified rather than pretending.
 *  - Degradations: what a production ran without (DOS-75), shown to its owner.
 *
 * Mirrors packages/shared/src/truth (keep in sync; the web app does not import
 * workspace packages).
 */
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

// These tables come from migration 0031, which is not on the live database
// yet, so they are deliberately NOT in database.types.ts (the db package's
// drift guard forbids typing tables the live schema lacks). They are read
// through an untyped client and every read tolerates their absence.
export interface CapabilityRow {
  capability: string;
  provider: string | null;
  status: "production_ready" | "experimental" | "unavailable" | "disabled" | "not_implemented";
  real_execution: boolean;
  requires_gpu: boolean;
  supports: string[];
  note: string | null;
  reported_by: string;
  updated_at: string;
}

export interface DegradationRow {
  id: string;
  project_id: string;
  code: string;
  severity: "info" | "warning" | "major";
  scope: "project" | "scene" | "shot" | "film" | "locale";
  ref_id: string | null;
  message: string;
  detail: unknown;
  created_at: string;
}

const untyped = (): SupabaseClient | null => getSupabase() as unknown as SupabaseClient | null;

export type Capabilities =
  | { state: "unknown"; reason: string }
  | { state: "loaded"; rows: CapabilityRow[]; byId: Record<string, CapabilityRow> };

/** Output formats a production may request now (mirror of shared offeredFormats). */
export function offeredFormats(caps: Capabilities): string[] | null {
  if (caps.state !== "loaded") return null;
  const video = caps.byId.video_generation;
  const up = caps.byId.upscale_4k;
  const base = video?.real_execution ? video.supports : [];
  return up?.real_execution && base.length ? [...base, "4k"] : base;
}

export function videoAvailable(caps: Capabilities): boolean | null {
  if (caps.state !== "loaded") return null;
  return caps.byId.video_generation?.real_execution ?? false;
}

export async function loadCapabilities(): Promise<Capabilities> {
  const sb = untyped();
  if (!sb) return { state: "unknown", reason: "not connected" };
  const { data: raw, error } = await sb.from("system_capabilities").select("*");
  if (error) return { state: "unknown", reason: /does not exist|schema cache/i.test(error.message) ? "migration 0031 not applied" : error.message };
  const data = (raw ?? []) as CapabilityRow[];
  if (data.length === 0) return { state: "unknown", reason: "the worker has not reported yet" };
  const byId: Record<string, CapabilityRow> = {};
  for (const r of data) byId[r.capability] = r;
  return { state: "loaded", rows: data, byId };
}

export function useCapabilities(): Capabilities {
  const [caps, setCaps] = useState<Capabilities>({ state: "unknown", reason: "loading" });
  useEffect(() => {
    let live = true;
    loadCapabilities()
      .then((c) => live && setCaps(c))
      .catch((e) => live && setCaps({ state: "unknown", reason: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, []);
  return caps;
}

export async function loadDegradations(projectId: string): Promise<DegradationRow[]> {
  const sb = untyped();
  if (!sb) return [];
  const { data, error } = await sb
    .from("production_degradations")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  return error || !data ? [] : (data as DegradationRow[]);
}

export const CAPABILITY_LABEL: Record<string, string> = {
  film_planning: "Film planning (AI Director)",
  content_moderation: "Content check",
  seed_image_generation: "Seed stills",
  video_generation: "Video generation (own GPU)",
  video_generation_cinematic: "Cinematic engine",
  reference_image_conditioning: "Image-to-video identity",
  reference_video_conditioning: "Video-to-video",
  camera_control: "Camera control",
  lora_identity: "Identity models (LoRA)",
  lora_training: "Identity model training",
  narration_tts: "Narration voice",
  voice_cloning: "Voice cloning",
  music_generation: "Music score",
  sfx_generation: "Sound effects",
  translation: "Translation",
  upscale_4k: "4K upscale",
  storage: "Storage",
  visual_qc: "Visual quality check",
  technical_qc: "Technical quality check",
};

export const STATUS_LABEL: Record<CapabilityRow["status"], string> = {
  production_ready: "Production ready",
  experimental: "Experimental",
  unavailable: "Unavailable",
  disabled: "Disabled",
  not_implemented: "Not built",
};
