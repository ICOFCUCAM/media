/**
 * Talking with an avatar (DirectorOS W26; migration 0059). The owner starts a
 * conversation and adds lines — typed, or recorded; the worker hears, answers
 * in the persona, voices and animates every reply. Untyped client: the
 * database enforces who may write what.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

const untyped = (): SupabaseClient | null => getSupabase() as unknown as SupabaseClient | null;
export const TALK_BUCKET = "cineforge-assets";

export interface Conversation {
  id: string;
  title: string;
  persona: string;
  voiceId: string | null;
  language: string;
  imageKey: string | null;
  quality: "standard" | "premium";
}

export interface Turn {
  id: string;
  role: "user" | "avatar";
  text: string | null;
  status: "pending" | "thinking" | "speaking" | "animating" | "ready" | "failed";
  error: string | null;
  audioKey: string | null;
  videoKey: string | null;
}

export async function listConversations(): Promise<Conversation[] | null> {
  const sb = untyped();
  if (!sb) return null;
  const { data, error } = await sb.from("avatar_conversations").select("id, title, persona, voice_id, language, image_key, quality").order("created_at", { ascending: false }).limit(20);
  if (error) return null; // before migration 0059
  return (data ?? []).map((c) => ({ id: c.id, title: c.title, persona: c.persona, voiceId: c.voice_id, language: c.language, imageKey: c.image_key, quality: c.quality }));
}

export async function startConversation(userId: string, c: Omit<Conversation, "id" | "imageKey">, portrait: File | null): Promise<string> {
  const sb = untyped();
  if (!sb) throw new Error("Supabase not configured");
  let imageKey: string | null = null;
  if (portrait) {
    const ext = portrait.name.split(".").pop()?.toLowerCase() || "jpg";
    imageKey = `avatars/${userId}/talk-${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from(TALK_BUCKET).upload(imageKey, portrait, { upsert: true });
    if (up.error) throw new Error(up.error.message);
  }
  const { data, error } = await sb.from("avatar_conversations").insert({
    user_id: userId, title: c.title.trim().slice(0, 120), persona: c.persona.trim(), voice_id: c.voiceId, language: c.language, image_key: imageKey, quality: c.quality,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** The lines so far, with each reply's video (or reading) once it is made. */
export async function loadTurns(conversationId: string): Promise<Turn[]> {
  const sb = untyped();
  if (!sb) return [];
  const { data, error } = await sb.from("avatar_turns").select("id, role, text, status, error, voiceover_id, avatar_video_id").eq("conversation_id", conversationId).order("created_at", { ascending: true });
  if (error || !data) return [];
  const voIds = data.map((t) => t.voiceover_id).filter(Boolean);
  const avIds = data.map((t) => t.avatar_video_id).filter(Boolean);
  const [vos, avs] = await Promise.all([
    voIds.length ? sb.from("voiceovers").select("id, audio_key").in("id", voIds) : Promise.resolve({ data: [] as { id: string; audio_key: string | null }[] }),
    avIds.length ? sb.from("avatar_videos").select("id, video_key").in("id", avIds) : Promise.resolve({ data: [] as { id: string; video_key: string | null }[] }),
  ]);
  return data.map((t) => ({
    id: t.id, role: t.role, text: t.text, status: t.status, error: t.error,
    audioKey: (vos.data ?? []).find((v) => v.id === t.voiceover_id)?.audio_key ?? null,
    videoKey: (avs.data ?? []).find((v) => v.id === t.avatar_video_id)?.video_key ?? null,
  }));
}

/** Add the owner's line: typed text, or a recording (uploaded first, heard by the worker). */
export async function say(userId: string, conversationId: string, line: { text?: string; recording?: Blob }): Promise<void> {
  const sb = untyped();
  if (!sb) throw new Error("Supabase not configured");
  let audioKey: string | null = null;
  if (line.recording) {
    const ext = line.recording.type.includes("ogg") ? "ogg" : line.recording.type.includes("mp4") ? "m4a" : "webm";
    audioKey = `talk/${userId}/${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from(TALK_BUCKET).upload(audioKey, line.recording, { contentType: line.recording.type || "audio/webm" });
    if (up.error) throw new Error(up.error.message);
  }
  const text = line.text?.trim() || null;
  if (!text && !audioKey) throw new Error("Say something first.");
  const { error } = await sb.from("avatar_turns").insert({ conversation_id: conversationId, user_id: userId, role: "user", text, audio_key: audioKey });
  if (error) throw new Error(error.message);
}

export const TURN_LABEL: Record<Turn["status"], string> = {
  pending: "Sent", thinking: "Thinking…", speaking: "Speaking…", animating: "Animating…", ready: "", failed: "Failed",
};
