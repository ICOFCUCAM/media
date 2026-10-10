/**
 * What a render is built from (W5–W22), shared by the film's own render and
 * every dubbed render: the scene asset lists the render engine takes, and the
 * scenes as the lip-sync pass reads them. Pure over the scene rows.
 */
import type { SceneAssets } from "../ffmpeg/render-engine";
import type { LipSyncScene } from "../lipsync/run";

export interface RenderSceneRow {
  id: string;
  index: number;
  durationSec: number;
  shots: { id: string; videoKey: string | null; durationSec: number; cutSec: unknown; cameraType: string | null; cameraPlan: unknown }[];
  audioTracks: { kind: string; key: string; startMs: number; durationMs: number | null; meta: unknown }[];
  dialogueLines: { id: string; characterId: string | null; audioKey: string | null; startMs: number | null }[];
}

/** Legacy "stub" audio rows recorded a key without uploading a file: never use them. */
export const realTrack = (t: { meta: unknown }) => (t.meta as { generated?: string } | null)?.generated !== "stub";

const cut = (v: unknown) => (v == null ? null : Number(v));

/** The engine's scene assets: each shot's clip (or its replacement), cuts, music, voice, sound design. */
export function sceneAssetsOf(
  scenes: RenderSceneRow[],
  opts: { clipOf?: (shot: { id: string; videoKey: string | null }) => string | null; voiceOf?: (sceneId: string) => string | undefined } = {},
): SceneAssets[] {
  const clipOf = opts.clipOf ?? ((sh) => sh.videoKey);
  return scenes.map((s) => {
    const tracks = s.audioTracks.filter(realTrack);
    return {
      sceneId: s.id,
      index: s.index,
      shotKeys: s.shots.map(clipOf).filter((k): k is string => !!k),
      // The editor's cut lengths (W13), aligned with shotKeys: the clip is trimmed to it.
      shotCutSec: s.shots.filter((sh) => !!sh.videoKey).map((sh) => cut(sh.cutSec)),
      musicKey: tracks.find((t) => t.kind === "MUSIC")?.key,
      voiceKey: opts.voiceOf ? opts.voiceOf(s.id) : tracks.find((t) => t.kind === "VOICE")?.key,
      // Sound design (W16): the scene's ambience bed and placed effects.
      sounds: tracks.filter((t) => t.kind === "AMBIENCE" || t.kind === "SFX").map((t) => ({
        kind: t.kind as "AMBIENCE" | "SFX", key: t.key, startMs: t.startMs, durationMs: t.durationMs ?? 0,
        plannedSceneMs: (t.meta as { plannedSceneMs?: number } | null)?.plannedSceneMs,
      })),
    };
  });
}

/** One dubbed scene's speech (W22): its track and where each line sits in it. */
export interface DubbedScene {
  trackKey: string;
  cues: { lineId: string | null; characterId: string | null; startMs: number; durationMs: number }[];
}

/**
 * The scenes as the lip-sync pass reads them. The film's own voice: each
 * line's own audio file. A dub (W22): slices of the dubbed scene track, where
 * each translated line starts and for as long as it is spoken.
 */
export function lipSyncScenesOf(scenes: RenderSceneRow[], dub?: Map<string, DubbedScene>): LipSyncScene[] {
  return scenes.map((s) => {
    const shots = s.shots.map((sh) => ({
      id: sh.id, videoKey: sh.videoKey, durationSec: sh.durationSec, cutSec: cut(sh.cutSec),
      size: (sh.cameraPlan as { shotSize?: string } | null)?.shotSize ?? sh.cameraType ?? null,
      subjectKeys: (sh.cameraPlan as { subjectKeys?: string[] } | null)?.subjectKeys ?? [],
    }));
    if (dub) {
      const d = dub.get(s.id);
      const spoken = (d?.cues ?? []).filter((c) => c.lineId && c.characterId && c.durationMs > 0);
      return {
        sceneId: s.id, index: s.index, shots,
        lines: spoken.map((c) => ({ id: c.lineId!, characterId: c.characterId, audioKey: d!.trackKey, startMs: c.startMs, offsetMs: c.startMs })),
        lineMs: Object.fromEntries(spoken.map((c) => [c.lineId!, c.durationMs])),
      };
    }
    return {
      sceneId: s.id, index: s.index, shots,
      lines: s.dialogueLines,
      lineMs: Object.fromEntries(s.audioTracks.filter((t) => t.kind === "VOICE")
        .flatMap((t) => ((t.meta as { cues?: { lineId?: string | null; durationMs?: number }[] } | null)?.cues ?? []))
        .filter((c) => c.lineId && c.durationMs).map((c) => [c.lineId!, c.durationMs!])),
    };
  });
}
