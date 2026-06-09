"use client";

import { getSupabase } from "./supabase";
import type { Database, LocationKind } from "./database.types";

export type CharacterRow = Database["public"]["Tables"]["characters"]["Row"];
export type LocationRow = Database["public"]["Tables"]["locations"]["Row"];

export const LOCATION_KINDS: LocationKind[] = ["CITY", "KINGDOM", "BUILDING", "ROOM", "LANDSCAPE", "INTERIOR", "EXTERIOR"];

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

export async function listCharacters(): Promise<CharacterRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("characters").select().order("created_at", { ascending: false });
  return data ?? [];
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

export async function listLocations(): Promise<LocationRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("locations").select().order("created_at", { ascending: false });
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
