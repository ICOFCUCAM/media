/**
 * Voice continuity over what was actually spoken (DirectorOS Part 1 §32.6;
 * W14). The plan gives every character one voice; the render can still break
 * that, and the audience hears it:
 *
 *   a character who speaks in their chosen (cloned) voice in one scene and in
 *   a built-in voice in another — the chosen voice failed for some scenes only;
 *   built-in voices from different engines in different scenes — the narrator
 *   and every character without a chosen voice change voice mid-film.
 *
 * Read from the scene voice tracks' metadata (audio_tracks.meta: engine, cues)
 * and recorded as AUDIO_CONTINUITY warnings — the film still renders.
 */
import { degradation, type Degradation } from "@cineforge/shared";

export interface VoiceTrackMeta {
  sceneId: string;
  sceneIndex: number;
  meta: unknown;
}

interface Parsed { engine: string | null; cues: { characterId: string | null; voice: "cloned" | "built-in" }[] }

function parse(meta: unknown): Parsed | null {
  const m = meta as { provider?: unknown; engine?: unknown; cues?: unknown } | null;
  if (!m || m.provider !== "voice-engine" || !Array.isArray(m.cues)) return null;
  return {
    engine: typeof m.engine === "string" ? m.engine : null,
    cues: (m.cues as { characterId?: unknown; voice?: unknown }[])
      .filter((c) => c.voice === "cloned" || c.voice === "built-in")
      .map((c) => ({ characterId: typeof c.characterId === "string" ? c.characterId : null, voice: c.voice as "cloned" | "built-in" })),
  };
}

const sceneList = (idx: number[]) => [...new Set(idx)].sort((a, b) => a - b).map((i) => i + 1).join(", ");

export function voiceContinuity(tracks: VoiceTrackMeta[], names: Map<string, string> = new Map()): Degradation[] {
  const out: Degradation[] = [];
  const byCharacter = new Map<string, { cloned: number[]; builtIn: number[] }>();
  const builtInEngines = new Map<string, number[]>();
  for (const t of tracks) {
    const p = parse(t.meta);
    if (!p) continue;
    // The scene's built-in voices all come from the scene's stock engine.
    if (p.engine && p.cues.some((c) => c.voice === "built-in")) builtInEngines.set(p.engine, [...(builtInEngines.get(p.engine) ?? []), t.sceneIndex]);
    for (const c of p.cues) {
      if (!c.characterId) continue;
      const e = byCharacter.get(c.characterId) ?? { cloned: [], builtIn: [] };
      (c.voice === "cloned" ? e.cloned : e.builtIn).push(t.sceneIndex);
      byCharacter.set(c.characterId, e);
    }
  }
  for (const [characterId, e] of byCharacter) {
    if (!e.cloned.length || !e.builtIn.length) continue;
    const name = names.get(characterId) ?? "A character";
    out.push(degradation("AUDIO_CONTINUITY", "film",
      `${name} speaks in their chosen voice in scene ${sceneList(e.cloned)} but in a built-in voice in scene ${sceneList(e.builtIn)} — the voice changes mid-film.`,
      { severity: "warning", refId: characterId, detail: { code: "VOICE_CHANGES", characterId, clonedScenes: sceneList(e.cloned), builtInScenes: sceneList(e.builtIn) } }));
  }
  if (builtInEngines.size > 1) {
    const parts = [...builtInEngines].map(([engine, idx]) => `${engine} (scene ${sceneList(idx)})`);
    out.push(degradation("AUDIO_CONTINUITY", "film",
      `Built-in voices came from different voice engines — ${parts.join(", ")} — so the narrator and characters without a chosen voice sound different between scenes.`,
      { severity: "warning", detail: { code: "BUILT_IN_ENGINE_CHANGES", engines: Object.fromEntries([...builtInEngines].map(([k, v]) => [k, sceneList(v)])) } }));
  }
  return out;
}
