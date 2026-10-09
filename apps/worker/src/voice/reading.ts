/**
 * A Voice Studio reading on the Voice Engine (DirectorOS W15; Part 3 §116–117,
 * Part 4 §143, §156, §170, §174). The reader no longer calls a provider
 * directly: every part is routed (gates, licences, configuration), spoken
 * through the cached, metered engine, mastered outside the model and joined.
 *
 *   narrator / presenter   one voice reads the text in the mode's style, with
 *                          the owner's controls (emotion, energy, speed, pitch)
 *   conversation           "Name: line" scripts, each speaker in their own voice
 *
 * Who may speak with a voice (§170): its owner, or a user holding an active
 * licence to a voice that is still offered (APPROVED, READY). The database
 * refuses anything else on insert; this re-checks at speaking time, because
 * a licence can be revoked or the voice withdrawn after the row was written.
 * A voice without recorded consent never speaks. A chosen voice never falls
 * back to a stock narrator: if no engine can speak it, the reading fails and
 * says why.
 */
import { join } from "node:path";
import {
  conversationSpeakers,
  parseConversation,
  READING_MODES,
  readingStyle,
  routeVoice,
  segmentScript,
  type ReadingMode,
  type VoiceEngine,
  type VoiceEngineArtifact,
  type VoiceStyle,
} from "@cineforge/voice-contracts";
import { presetFor } from "./film";

export interface ReadingRow {
  id: string;
  userId: string;
  voiceId: string | null;
  text: string;
  language: string;
  mode: string;
  style: unknown;
  speakers: unknown;
}

export interface ReadingVoice {
  id: string;
  userId: string;
  status: string;
  shareStatus: string;
  consentType: string | null;
  consentConfirmedAt: Date | null;
  provider: string | null;
  providerVoiceId: string | null;
}

export interface ReadingDeps {
  env: Record<string, string | undefined>;
  /** The routed engine, already cached and metered for the reading's owner; null when it cannot be built. */
  engine(id: string): VoiceEngine | null;
  voice(id: string): Promise<ReadingVoice | null>;
  /** An active licence held by the user for this voice. */
  licensed(voiceId: string, userId: string): Promise<boolean>;
  artifact(voiceId: string, engineId: string, engineVersion: string): Promise<VoiceEngineArtifact | null>;
  master(input: string, output: string): Promise<void>;
  join(files: string[], output: string, dir: string, gapMs?: number): Promise<void>;
  measure(path: string): Promise<{ durationSec: number }>;
  encodeMp3(wav: string, mp3: string): Promise<void>;
  upload(path: string, key: string, contentType: string): Promise<void>;
}

/** Refused before anything is spoken (no retry helps). */
export class ReadingError extends Error {}

export const READING_MAX_CHARS = (env: Record<string, string | undefined>) => Number(env.VOICEOVER_MAX_CHARS ?? 20_000);
const TURN_GAP_MS = 350;

interface Speaker { engine: VoiceEngine; artifact: VoiceEngineArtifact | null; preset?: string; voiceId: string | null }

export interface ReadingResult {
  audioKey: string;
  durationMs: number;
  engines: string[];
  parts: number;
  segments: number;
}

export async function renderReading(row: ReadingRow, dir: string, deps: ReadingDeps): Promise<ReadingResult> {
  const mode: ReadingMode = (READING_MODES as readonly string[]).includes(row.mode) ? (row.mode as ReadingMode) : "narrator";
  const text = row.text.trim();
  if (!text) throw new ReadingError("the reading is empty");
  const max = READING_MAX_CHARS(deps.env);
  if (text.length > max) throw new ReadingError(`text too long for one reading (${text.length} > ${max} characters) — split it into parts`);
  const style: VoiceStyle = readingStyle(mode, row.style);

  // Who says what: one voice, or a conversation's speakers.
  let parts: { label: string | null; text: string; voiceId: string | null }[];
  if (mode === "conversation") {
    const lines = parseConversation(text);
    const cast = new Map<string, string | null>();
    for (const s of Array.isArray(row.speakers) ? (row.speakers as { label?: unknown; voice_id?: unknown }[]) : []) {
      if (typeof s?.label === "string") cast.set(s.label.trim().toLowerCase(), typeof s.voice_id === "string" ? s.voice_id : null);
    }
    const unknown = conversationSpeakers(lines).filter((l) => !cast.has(l.toLowerCase()));
    if (unknown.length) throw new ReadingError(`no voice chosen for ${unknown.join(", ")} — add them as speakers`);
    parts = lines.map((l) => ({ label: l.speaker.toLowerCase(), text: l.text, voiceId: cast.get(l.speaker.toLowerCase()) ?? null }));
  } else {
    parts = [{ label: null, text, voiceId: row.voiceId }];
  }

  const stockChoice = routeVoice({ cloning: false, language: row.language }, deps.env);
  const labels = [...new Set(parts.map((p) => p.label ?? ""))];
  const speakers = new Map<string, Speaker>();
  async function speakerFor(label: string | null, voiceId: string | null): Promise<Speaker> {
    const key = `${label ?? ""}|${voiceId ?? ""}`;
    const known = speakers.get(key);
    if (known) return known;
    let s: Speaker;
    if (!voiceId) {
      const engine = stockChoice.engine ? deps.engine(stockChoice.engine.id) : null;
      if (!engine) throw new ReadingError(`no voice engine can speak right now (${reasons(stockChoice.passedOver) || "no voice engines configured (VOICE_ENGINES)"})`);
      // Each built-in speaker of a conversation gets a distinct preset.
      s = { engine, artifact: null, preset: presetFor(engine.getCapabilities().presets, labels, label), voiceId: null };
    } else {
      s = await clonedSpeaker(voiceId);
    }
    speakers.set(key, s);
    return s;
  }
  async function clonedSpeaker(voiceId: string): Promise<Speaker> {
    const v = await deps.voice(voiceId);
    if (!v) throw new ReadingError("the chosen voice no longer exists");
    const own = v.userId === row.userId;
    if (!own && !(v.shareStatus === "APPROVED" && v.status === "READY" && (await deps.licensed(v.id, row.userId))))
      throw new ReadingError("you hold no licence to this voice, or its owner withdrew it");
    if (!v.consentType || !v.consentConfirmedAt) throw new ReadingError("the chosen voice has no recorded consent");
    if (v.status !== "READY") throw new ReadingError("the chosen voice is not ready");
    const choice = routeVoice({ cloning: true, language: row.language }, deps.env);
    const engine = choice.engine ? deps.engine(choice.engine.id) : null;
    if (!engine) throw new ReadingError(`no voice engine can use a cloned voice right now (${reasons(choice.passedOver)})`);
    let artifact = await deps.artifact(v.id, engine.id, engine.version);
    if (!artifact && v.provider === engine.id && v.providerVoiceId) artifact = { artifactType: "provider_voice_id", uri: v.providerVoiceId };
    if (!artifact) throw new ReadingError("the chosen voice is not enrolled with the current voice engine");
    return { engine, artifact, voiceId: v.id };
  }

  const spoken: string[] = [];
  const engines = new Set<string>();
  let segments = 0;
  for (const [i, part] of parts.entries()) {
    const sp = await speakerFor(part.label, part.voiceId);
    engines.add(sp.engine.id);
    const limit = Math.min(sp.engine.getCapabilities().maxChars, 1000);
    const mastered: string[] = [];
    for (const seg of segmentScript(part.text, limit)) {
      const raw = join(dir, `part-${i}-${seg.sequence}.raw`);
      const r = await sp.engine.synthesize({ text: seg.text, language: row.language, voice: sp.artifact, preset: sp.preset, style, outPath: raw, voiceId: sp.voiceId });
      const m = join(dir, `part-${i}-${seg.sequence}.wav`);
      await deps.master(r.path, m);
      mastered.push(m);
      segments++;
    }
    const file = join(dir, `part-${i}.wav`);
    await deps.join(mastered, file, dir);
    spoken.push(file);
  }

  const wav = join(dir, "reading.wav");
  await deps.join(spoken, wav, dir, mode === "conversation" ? TURN_GAP_MS : undefined);
  const { durationSec } = await deps.measure(wav);
  const mp3 = join(dir, "reading.mp3");
  await deps.encodeMp3(wav, mp3);
  const audioKey = `voiceovers/${row.userId}/${row.id}.mp3`;
  await deps.upload(mp3, audioKey, "audio/mpeg");
  return { audioKey, durationMs: Math.round(durationSec * 1000), engines: [...engines], parts: parts.length, segments };
}

const reasons = (p: { id: string; reason: string }[]) => p.map((x) => `${x.id}: ${x.reason}`).join("; ");
