/**
 * Director workspace data (DirectorOS W9): the film's bible, scenes and shots,
 * timeline, decision log and conversation, read through an untyped client
 * like the other DirectorOS tables (each read tolerates its table not being
 * migrated yet).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

const untyped = (): SupabaseClient | null => getSupabase() as unknown as SupabaseClient | null;

export interface BibleCharacter {
  id: string;
  name: string;
  role: string;
  age: number | null;
  identity: { face?: string; hair?: string; body?: string; marks?: string[] };
  wardrobe: { id: string; description: string }[];
  voice: string;
}

export interface Bible {
  title: string;
  logline: string;
  characters: BibleCharacter[];
  locations: { id: string; name: string; description: string }[];
  props: { id: string; name: string; description: string }[];
}

export async function loadBible(projectId: string): Promise<Bible | null> {
  const sb = untyped();
  if (!sb) return null;
  const { data } = await sb.from("screenplays").select("raw,logline").eq("project_id", projectId).maybeSingle();
  const pkg = (data as { raw?: { package?: Record<string, unknown> } } | null)?.raw?.package as
    | { film?: { title?: string; logline?: string }; cast?: Record<string, unknown>[]; locations?: Record<string, unknown>[]; props?: Record<string, unknown>[] }
    | undefined;
  if (!pkg?.cast) return null;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    title: str(pkg.film?.title),
    logline: str(pkg.film?.logline),
    characters: pkg.cast.map((c) => ({
      id: str(c.id), name: str(c.name), role: str(c.role), age: typeof c.age === "number" ? c.age : null,
      identity: (c.identity as BibleCharacter["identity"]) ?? {},
      wardrobe: (c.wardrobe as BibleCharacter["wardrobe"]) ?? [],
      voice: str((c.voice as { description?: string } | undefined)?.description),
    })),
    locations: (pkg.locations ?? []).map((l) => ({ id: str(l.id), name: str(l.name), description: str(l.description) })),
    props: (pkg.props ?? []).map((p) => ({ id: str(p.id), name: str(p.name), description: str(p.description) })),
  };
}

export interface WorkspaceShot {
  id: string;
  index: number;
  status: string;
  durationSec: number;
  camera: string | null;
  still: string | null;
  thumb: string | null;
}

export interface WorkspaceScene {
  id: string;
  index: number;
  heading: string;
  summary: string;
  status: string;
  durationSec: number;
  shots: WorkspaceShot[];
}

export async function loadScenes(projectId: string): Promise<WorkspaceScene[]> {
  const sb = untyped();
  if (!sb) return [];
  const { data } = await sb
    .from("scenes")
    .select("id,index,heading,summary,status,duration_sec,shots(id,index,status,duration_sec,camera_type,camera_movement,seed_image_key,thumbnail_key)")
    .eq("project_id", projectId)
    .order("index");
  type Row = { id: string; index: number; heading: string; summary: string; status: string; duration_sec: number; shots: { id: string; index: number; status: string; duration_sec: number | null; camera_type: string | null; camera_movement: string | null; seed_image_key: string | null; thumbnail_key: string | null }[] };
  return ((data ?? []) as Row[]).map((r) => {
    const shots = [...r.shots].sort((a, b) => a.index - b.index).map((s) => ({
      id: s.id, index: s.index, status: s.status, durationSec: s.duration_sec ?? 0,
      camera: [s.camera_type, s.camera_movement].filter(Boolean).join(" · ") || null,
      still: s.seed_image_key, thumb: s.thumbnail_key,
    }));
    return {
      id: r.id, index: r.index, heading: r.heading, summary: r.summary, status: r.status,
      durationSec: r.duration_sec || shots.reduce((n, s) => n + s.durationSec, 0),
      shots,
    };
  });
}

export interface TimelineBar {
  kind: string;
  startSec: number;
  endSec: number;
  label: string;
}

/**
 * The film's timeline: the latest production timeline's events when the
 * Master Clock has built one (production_timelines), otherwise the plan laid
 * end to end from scene and shot lengths — labelled as planned.
 */
export async function loadTimeline(projectId: string, scenes: WorkspaceScene[]): Promise<{ source: "timeline" | "plan"; version: number | null; status: string | null; bars: TimelineBar[]; durationSec: number }> {
  const sb = untyped();
  if (sb) {
    const { data: tl } = await sb.from("production_timelines").select("id,version,status,duration_us").eq("project_id", projectId).order("version", { ascending: false }).limit(1).maybeSingle();
    const t = tl as { id: string; version: number; status: string; duration_us: number } | null;
    if (t) {
      const { data: ev } = await sb.from("timeline_events").select("kind,start_us,end_us,payload").eq("timeline_version_id", t.id).in("kind", ["scene", "shot", "dialogue", "narration", "music_cue"]).order("start_us").limit(500);
      const bars = ((ev ?? []) as { kind: string; start_us: number; end_us: number; payload: Record<string, unknown> | null }[]).map((e) => ({
        kind: e.kind, startSec: e.start_us / 1e6, endSec: e.end_us / 1e6, label: String(e.payload?.label ?? e.payload?.text ?? e.kind).slice(0, 60),
      }));
      if (bars.length) return { source: "timeline", version: t.version, status: t.status, bars, durationSec: t.duration_us / 1e6 || Math.max(...bars.map((b) => b.endSec)) };
    }
  }
  const bars: TimelineBar[] = [];
  let at = 0;
  for (const sc of scenes) {
    bars.push({ kind: "scene", startSec: at, endSec: at + sc.durationSec, label: `${sc.index + 1}. ${sc.heading}` });
    let s = at;
    for (const sh of sc.shots) {
      bars.push({ kind: "shot", startSec: s, endSec: s + sh.durationSec, label: `Shot ${sh.index + 1}` });
      s += sh.durationSec;
    }
    at += sc.durationSec;
  }
  return { source: "plan", version: null, status: null, bars, durationSec: at };
}

export interface Decision {
  id: string;
  task: string;
  provider: string | null;
  model: string | null;
  outcome: string;
  summary: string | null;
  errorCode: string | null;
  createdAt: string;
}

export async function loadDecisions(projectId: string): Promise<Decision[]> {
  const sb = untyped();
  if (!sb) return [];
  const { data, error } = await sb.from("ai_decisions").select("id,task,provider,model,outcome,summary,error_code,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(30);
  if (error) return [];
  return ((data ?? []) as { id: string; task: string; provider: string | null; model: string | null; outcome: string; summary: string | null; error_code: string | null; created_at: string }[]).map((d) => ({
    id: d.id, task: d.task, provider: d.provider, model: d.model, outcome: d.outcome, summary: d.summary, errorCode: d.error_code, createdAt: d.created_at,
  }));
}

export interface ChatMessage {
  id: string;
  author: "owner" | "director";
  body: string;
  status: string;
  editRequestId: string | null;
  createdAt: string;
}

export async function loadConversation(projectId: string): Promise<ChatMessage[] | null> {
  const sb = untyped();
  if (!sb) return null;
  const { data, error } = await sb.from("director_messages").select("id,author,body,status,edit_request_id,created_at").eq("project_id", projectId).order("created_at").limit(200);
  if (error) return null; // before 0042
  return ((data ?? []) as { id: string; author: "owner" | "director"; body: string; status: string; edit_request_id: string | null; created_at: string }[]).map((m) => ({
    id: m.id, author: m.author, body: m.body, status: m.status, editRequestId: m.edit_request_id, createdAt: m.created_at,
  }));
}

export async function sendInstruction(projectId: string, body: string): Promise<void> {
  const sb = untyped();
  if (!sb) throw new Error("Supabase not configured");
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) throw new Error("Not signed in");
  const { error } = await sb.from("director_messages").insert({ project_id: projectId, author: "owner", user_id: auth.user.id, body: body.trim().slice(0, 2000) });
  if (error) throw new Error(error.message);
}
