/**
 * A scene's voice track on the Voice Engine (W7b, docs/51 §6).
 *
 * The scene's spoken parts, in order — the voice-over, then each dialogue line
 * — are spoken by the right voice: a character's own cloned voice when the
 * film's owner chose one for them (theirs, ready, consented), otherwise one of
 * the engine's built-in voices, the same one for that character in every scene
 * so the cast sounds distinct. The narrator is the engine's default voice.
 * Each part is segmented, spoken, mastered outside the model and stored; the
 * parts are joined with a fixed pause into the scene's voice track, and each
 * line records where it starts. A chosen voice that cannot be used is
 * replaced by a built-in voice and that is reported, never hidden.
 */
import { join } from "node:path";
import {
  routeVoice,
  segmentScript,
  withTraits,
  type VoiceEngine,
  type VoiceEngineArtifact,
  type VoiceStyle,
  type VoiceTraits,
} from "@cineforge/voice-contracts";
import type { SpeechMeasure } from "./mastering";

/** Pause between spoken parts in a scene, ms (the validator plans for it: SPEECH_GAP_SEC). */
export const CUE_GAP_MS = 350;

export interface SceneLine {
  id: string;
  characterId: string | null;
  text: string;
  emotion: string | null;
}

export interface SceneSpeech {
  id: string;
  narration: string | null;
  /** Legacy single-string dialogue and the summary are spoken only when there is nothing else. */
  dialogue: string | null;
  summary: string | null;
  lines: SceneLine[];
  /**
   * Planned by the Director (Film IR): narration and dialogue are the whole
   * soundtrack, and a scene without either is meant to be silent. The legacy
   * fallback (speaking the summary, a camera description) is for older projects only.
   */
  planned?: boolean;
}

export interface Cue {
  /** Dialogue line id, or null for narration. */
  lineId: string | null;
  characterId: string | null;
  text: string;
  emotion: string | null;
}

/** What the scene says, in order. Empty when there is nothing to speak. */
export function sceneCues(s: SceneSpeech): Cue[] {
  const cues: Cue[] = [];
  if (s.narration?.trim()) cues.push({ lineId: null, characterId: null, text: s.narration.trim(), emotion: null });
  for (const l of s.lines) if (l.text.trim()) cues.push({ lineId: l.id, characterId: l.characterId, text: l.text.trim(), emotion: l.emotion });
  if (!cues.length && !s.planned) {
    const fallback = (s.dialogue || s.summary || "").trim();
    if (fallback) cues.push({ lineId: null, characterId: null, text: fallback, emotion: null });
  }
  return cues;
}

/** The built-in voice for a character: by their place in the cast, never the narrator's (presets[0]). */
export function presetFor(presets: string[], castOrder: string[], characterId: string | null): string | undefined {
  if (!presets.length) return undefined;
  if (!characterId || presets.length === 1) return presets[0];
  const i = castOrder.indexOf(characterId);
  const n = i < 0 ? [...characterId].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) : i;
  return presets[1 + (n % (presets.length - 1))];
}

export interface ChosenVoice {
  id: string;
  userId: string;
  status: string;
  consentType: string | null;
  consentConfirmedAt: Date | null;
  provider: string | null;
  providerVoiceId: string | null;
}

export interface SceneVoiceDeps {
  env: Record<string, string | undefined>;
  engine(id: string): VoiceEngine | null;
  voice(id: string): Promise<ChosenVoice | null>;
  artifact(voiceId: string, engineId: string, engineVersion: string): Promise<VoiceEngineArtifact | null>;
  master(input: string, output: string): Promise<void>;
  join(files: string[], output: string, dir: string, gapMs?: number): Promise<void>;
  measure(path: string): Promise<SpeechMeasure>;
  upload(path: string, key: string, contentType: string): Promise<void>;
  /** A character's loudness trait: gain (dB) after mastering, peak-limited (§19.2). */
  gain?(input: string, output: string, db: number): Promise<void>;
}

export interface SceneVoiceInput {
  scene: SceneSpeech;
  language: string;
  /** The film's owner: only their voices may speak. */
  ownerId: string;
  /** All of the film's characters in a stable order (built-in voice assignment). */
  castOrder: string[];
  /** Character id → the voice the owner chose for them (characters.voice_profile.voiceId). */
  chosenVoices: Record<string, string | undefined>;
  /** Character id → fixed voice traits (characters.voice_profile.traits): pitch, rate, loudness (§19.2). */
  traits?: Record<string, VoiceTraits>;
  /** Where the scene track goes (`…/voice/<job>.wav`). */
  trackKey: string;
  /** Where each line's own audio goes (`<prefix>/<lineId>.wav`); null stores no per-line files (dubs). */
  lineKeyPrefix?: string | null;
  dir: string;
}

export interface SpokenCue {
  lineId: string | null;
  characterId: string | null;
  voice: "cloned" | "built-in";
  startMs: number;
  durationMs: number;
  audioKey: string | null;
  /** What spoke it, for the segment ledger (§149). */
  engine: string;
  engineVersion: string;
  voiceId: string | null;
  preset: string | null;
  segments: number;
}

export interface Substitution {
  characterId: string;
  reason: string;
}

export interface SceneVoiceResult {
  trackKey: string;
  /** The scene track on local disk (inside `dir`), for callers that join scenes. */
  trackPath: string;
  durationSec: number;
  engine: string;
  cues: SpokenCue[];
  substitutions: Substitution[];
  loudnessLufs: number | null;
}

/** The voice a film's owner chose for a character (characters.voice_profile.voiceId). */
export function chosenVoiceId(profile: unknown): string | undefined {
  const id = (profile as { voiceId?: unknown } | null)?.voiceId;
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : undefined;
}

/** No configured engine can speak at all: the caller records the missing track. */
export class NoVoiceEngineError extends Error {}

type Speaker = { engine: VoiceEngine; artifact: VoiceEngineArtifact | null; preset?: string; cloned: boolean; voiceId?: string };

export async function renderSceneVoice(input: SceneVoiceInput, deps: SceneVoiceDeps): Promise<SceneVoiceResult | null> {
  const cues = sceneCues(input.scene);
  if (!cues.length) return null;

  const stockChoice = routeVoice({ cloning: false, language: input.language }, deps.env);
  const stock = stockChoice.engine ? deps.engine(stockChoice.engine.id) : null;
  if (!stock) {
    throw new NoVoiceEngineError(stockChoice.passedOver.map((p) => `${p.id}: ${p.reason}`).join("; ") || "no voice engines configured (VOICE_ENGINES)");
  }
  const presets = stock.getCapabilities().presets;
  const builtIn = (characterId: string | null): Speaker => ({ engine: stock, artifact: null, preset: presetFor(presets, input.castOrder, characterId), cloned: false });

  const substitutions: Substitution[] = [];
  const speakers = new Map<string, Speaker>();
  const speakerFor = async (characterId: string | null): Promise<Speaker> => {
    if (!characterId) return builtIn(null);
    const known = speakers.get(characterId);
    if (known) return known;
    const s = (await clonedSpeaker(characterId)) ?? builtIn(characterId);
    speakers.set(characterId, s);
    return s;
  };
  const substitute = (characterId: string, reason: string) => {
    substitutions.push({ characterId, reason });
    return null;
  };
  async function clonedSpeaker(characterId: string): Promise<Speaker | null> {
    const voiceId = input.chosenVoices[characterId];
    if (!voiceId) return null;
    const v = await deps.voice(voiceId);
    if (!v || v.userId !== input.ownerId) return substitute(characterId, "the chosen voice is not one of the film owner's voices");
    if (!v.consentType || !v.consentConfirmedAt) return substitute(characterId, "the chosen voice has no recorded consent");
    if (v.status !== "READY") return substitute(characterId, "the chosen voice is not ready");
    const choice = routeVoice({ cloning: true, language: input.language }, deps.env);
    const engine = choice.engine ? deps.engine(choice.engine.id) : null;
    if (!engine) return substitute(characterId, `no voice engine can use a cloned voice right now (${choice.passedOver.map((p) => `${p.id}: ${p.reason}`).join("; ")})`);
    let artifact = await deps.artifact(v.id, engine.id, engine.version);
    if (!artifact && v.provider === engine.id && v.providerVoiceId) artifact = { artifactType: "provider_voice_id", uri: v.providerVoiceId };
    if (!artifact) return substitute(characterId, "the chosen voice is not enrolled with the current voice engine");
    return { engine, artifact, cloned: true, voiceId: v.id };
  }

  const spoken: { cue: Cue; file: string; speaker: Speaker; segments: number }[] = [];
  for (const [i, cue] of cues.entries()) {
    const speaker = await speakerFor(cue.characterId);
    const traits = (cue.characterId && input.traits?.[cue.characterId]) || {};
    // The character keeps their pitch and rate in every scene; the line keeps its emotion (§19.2).
    const style: VoiceStyle | undefined = withTraits(cue.emotion ? { emotion: cue.emotion } : undefined, traits);
    const limit = Math.min(speaker.engine.getCapabilities().maxChars, 1000);
    const mastered: string[] = [];
    for (const seg of segmentScript(cue.text, limit)) {
      const raw = join(input.dir, `cue-${i}-${seg.sequence}.raw`);
      const r = await speaker.engine.synthesize({ text: seg.text, language: input.language, voice: speaker.artifact, preset: speaker.preset, style, outPath: raw, voiceId: speaker.voiceId ?? null });
      const m = join(input.dir, `cue-${i}-${seg.sequence}.wav`);
      await deps.master(r.path, m);
      mastered.push(m);
    }
    let file = join(input.dir, `cue-${i}.wav`);
    await deps.join(mastered, file, input.dir);
    if (traits.loudnessDb && deps.gain) {
      const leveled = join(input.dir, `cue-${i}-level.wav`);
      await deps.gain(file, leveled, traits.loudnessDb);
      file = leveled;
    }
    spoken.push({ cue, file, speaker, segments: mastered.length });
  }

  const out: SpokenCue[] = [];
  let at = 0;
  for (const s of spoken) {
    const { durationSec } = await deps.measure(s.file);
    const durationMs = Math.round(durationSec * 1000);
    let audioKey: string | null = null;
    const prefix = input.lineKeyPrefix === undefined ? `scenes/${input.scene.id}/audio/lines` : input.lineKeyPrefix;
    if (s.cue.lineId && prefix) {
      audioKey = `${prefix}/${s.cue.lineId}.wav`;
      await deps.upload(s.file, audioKey, "audio/wav");
    }
    out.push({
      lineId: s.cue.lineId, characterId: s.cue.characterId, voice: s.speaker.cloned ? "cloned" : "built-in", startMs: at, durationMs, audioKey,
      engine: s.speaker.engine.id, engineVersion: s.speaker.engine.version, voiceId: s.speaker.voiceId ?? null, preset: s.speaker.preset ?? null, segments: s.segments,
    });
    at += durationMs + CUE_GAP_MS;
  }

  const track = join(input.dir, "scene-voice.wav");
  await deps.join(spoken.map((s) => s.file), track, input.dir, CUE_GAP_MS);
  const measured = await deps.measure(track);
  await deps.upload(track, input.trackKey, "audio/wav");
  return {
    trackKey: input.trackKey,
    trackPath: track,
    durationSec: measured.durationSec,
    engine: stock.id,
    cues: out,
    substitutions,
    loudnessLufs: measured.integratedLufs,
  };
}

/**
 * The same scenes in another language (dubbing, W7c): every spoken part —
 * narration and each line — translated in one call, keeping who says what,
 * so each character keeps their own voice in every language.
 */
export async function translateSpeech(scenes: SceneSpeech[], translate: (texts: string[]) => Promise<string[]>): Promise<SceneSpeech[]> {
  const cues = scenes.map(sceneCues);
  const flat = cues.flat();
  const out = flat.length ? await translate(flat.map((c) => c.text)) : [];
  if (out.length !== flat.length) throw new Error(`translation returned ${out.length} parts for ${flat.length}`);
  let i = 0;
  return scenes.map((s, k) => {
    let narration: string | null = null;
    const lines: SceneLine[] = [];
    for (const c of cues[k]!) {
      const text = out[i++]!;
      if (c.lineId) lines.push({ id: c.lineId, characterId: c.characterId, text, emotion: c.emotion });
      else narration = text;
    }
    return { id: s.id, narration, dialogue: null, summary: null, lines };
  });
}
