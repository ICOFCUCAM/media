"use client";

import { getSupabase } from "./supabase";
import type { Database, Json, LocationKind } from "./database.types";

export type CharacterRow = Database["public"]["Tables"]["characters"]["Row"];
export type LocationRow = Database["public"]["Tables"]["locations"]["Row"];
export type AssetRow = Database["public"]["Tables"]["world_objects"]["Row"];

export const LOCATION_KINDS: LocationKind[] = ["CITY", "KINGDOM", "BUILDING", "ROOM", "LANDSCAPE", "INTERIOR", "EXTERIOR"];

export const ASSET_CATEGORIES = ["prop", "vehicle", "creature", "logo", "brand", "object"] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

/**
 * Reusable assets (characters, worlds) live in a per-user sentinel "Library"
 * project (projects.mode = 'library'). Because RLS scopes every read to the
 * owner, listing returns the user's whole catalog across projects — true reuse —
 * while new assets are parented to the library container. Characters/locations
 * are referenced by id from any project's scenes, so cross-project use just
 * works under RLS (owns_character + owns_scene both pass for the owner).
 */
async function getLibraryProjectId(): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data: auth } = await sb.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Not signed in");

  const { data: existing } = await sb
    .from("projects")
    .select("id")
    .eq("mode", "library")
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await sb
    .from("projects")
    .insert({ user_id: userId, title: "Library", prompt: "(reusable assets)", target_seconds: 0, mode: "library", status: "DRAFT" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/* ── Characters ─────────────────────────────────────────────── */
export async function createCharacter(input: {
  name: string;
  appearance: string;
  personality?: string;
  referenceUrl?: string;
}): Promise<CharacterRow> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const projectId = await getLibraryProjectId();
  const { data, error } = await sb
    .from("characters")
    .insert({
      project_id: projectId,
      name: input.name,
      appearance: input.appearance,
      personality: input.personality || null,
      reference_urls: input.referenceUrl ? [input.referenceUrl] : [],
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Character + the production it was created in ("Library" for manual ones). */
export type CharacterWithOrigin = CharacterRow & { projects: { title: string } | null };

export async function listCharacters(): Promise<CharacterWithOrigin[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("characters")
    .select("*, projects(title)")
    .order("created_at", { ascending: false });
  return (data as CharacterWithOrigin[] | null) ?? [];
}

/** The caller's own voices that can speak in a film (cloned, ready, consented). */
export async function listUsableVoices(): Promise<{ id: string; name: string }[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return [];
  const { data } = await sb
    .from("voices")
    .select("id,name,consent_type")
    .eq("user_id", auth.user.id)
    .eq("status", "READY")
    .order("created_at", { ascending: false });
  return (data ?? []).filter((v) => v.consent_type).map((v) => ({ id: v.id, name: v.name }));
}

/** Give a character one of your voices (null = a built-in voice). Keeps the rest of the profile. */
export async function setCharacterVoice(character: CharacterRow, voiceId: string | null): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const profile = { ...((character.voice_profile as Record<string, unknown> | null) ?? {}) };
  if (voiceId) profile.voiceId = voiceId;
  else delete profile.voiceId;
  const { error } = await sb.from("characters").update({ voice_profile: profile as Json }).eq("id", character.id);
  if (error) throw new Error(error.message);
}

/* ── Worlds / locations ─────────────────────────────────────── */
export async function createLocation(input: {
  name: string;
  kind: LocationKind;
  description: string;
}): Promise<LocationRow> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const projectId = await getLibraryProjectId();
  const { data, error } = await sb
    .from("locations")
    .insert({ project_id: projectId, name: input.name, kind: input.kind, description: input.description })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export type LocationWithOrigin = LocationRow & { projects: { title: string } | null };

export async function listLocations(): Promise<LocationWithOrigin[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("locations")
    .select("*, projects(title)")
    .order("created_at", { ascending: false });
  return (data as LocationWithOrigin[] | null) ?? [];
}

/* ── Visual assets (props, vehicles, creatures, logos, brands) ── */
export async function createAsset(input: {
  name: string;
  category: AssetCategory;
  description: string;
}): Promise<AssetRow> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const projectId = await getLibraryProjectId();
  const { data, error } = await sb
    .from("world_objects")
    .insert({ project_id: projectId, name: input.name, category: input.category, description: input.description })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listAssets(): Promise<AssetRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("world_objects").select().order("name", { ascending: true });
  return data ?? [];
}

/** Anchors offered to the storyboard "Reference" picker. */
export async function listAnchors(): Promise<{ characters: { id: string; name: string }[]; worlds: { id: string; name: string }[] }> {
  const [chars, locs] = await Promise.all([listCharacters(), listLocations()]);
  return {
    characters: chars.map((c) => ({ id: c.id, name: c.name })),
    worlds: locs.map((l) => ({ id: l.id, name: l.name })),
  };
}
