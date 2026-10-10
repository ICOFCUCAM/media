/**
 * Lip-sync a film's dialogue shots before assembly (W21). For each scene, the
 * shots in which a framed character speaks get that character's lines cut to
 * the shot and go through the lip-sync provider once; the result is stored
 * under a content key and used by the render in place of the raw clip. A shot
 * that cannot be lip-synced keeps its clip and is recorded (LIP_SYNC_FAILED);
 * no provider at all is recorded once (LIP_SYNC_UNAVAILABLE).
 *
 *   LIP_SYNC=1   turn it on (each lip-synced shot is one paid call)
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { degradation, type Degradation } from "@cineforge/shared";
import { dialogueStemArgs, lipSyncKey, lipSyncTargets, type LipSyncLine, type LipSyncShot, type LipSyncTarget } from "./plan";
import type { LipSyncProvider } from "./provider";

export function lipSyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LIP_SYNC === "1";
}

/** One scene as the lip-sync pass reads it. */
export interface LipSyncScene {
  sceneId: string;
  index: number;
  shots: { id: string; videoKey: string | null; durationSec: number; cutSec: number | null; size: string | null; subjectKeys: string[] }[];
  /** offsetMs: where the line starts inside its audio file (a dub's scene track, W22); absent = the line's own file. */
  lines: { id: string; characterId: string | null; audioKey: string | null; startMs: number | null; offsetMs?: number }[];
  /** Spoken length per line, from the scene's voice track cues. */
  lineMs: Record<string, number>;
}

/** Shots and lines of one scene on the scene's own clock (pure). `framedOf` maps a shot's subject keys to character ids. */
export function sceneLipSyncInputs(sc: LipSyncScene, framedOf: (keys: string[]) => string[]): { shots: LipSyncShot[]; lines: LipSyncLine[] } {
  let t = 0;
  const shots: LipSyncShot[] = [];
  for (const sh of sc.shots) {
    const dur = sh.cutSec != null && sh.cutSec > 0 ? sh.cutSec : sh.durationSec;
    if (sh.videoKey) shots.push({ shotId: sh.id, videoKey: sh.videoKey, startSec: t, durSec: dur, size: sh.size, framed: framedOf(sh.subjectKeys) });
    t += dur;
  }
  const lines: LipSyncLine[] = sc.lines
    .filter((l) => l.characterId && l.audioKey && l.startMs != null && sc.lineMs[l.id])
    .map((l) => ({
      lineId: l.id, characterId: l.characterId!, audioKey: l.audioKey!, startSec: l.startMs! / 1000, durSec: sc.lineMs[l.id]! / 1000,
      ...(l.offsetMs ? { audioOffsetSec: l.offsetMs / 1000 } : {}),
    }));
  return { shots, lines };
}

export interface LipSyncDeps {
  provider: LipSyncProvider | null;
  download(key: string, dest: string): Promise<void>;
  getBytes(key: string): Promise<Uint8Array>;
  putBytes(key: string, bytes: Uint8Array, contentType: string): Promise<unknown>;
  /** Size of a stored object; 0 when absent. */
  size(key: string): Promise<number>;
  ffmpeg(args: string[]): Promise<void>;
  meter?(t: LipSyncTarget): Promise<void>;
}

export interface LipSyncOutcome {
  /** Shot id → lip-synced clip key, for the shots that have one. */
  clips: Map<string, string>;
  gaps: Degradation[];
  made: number;
  reused: number;
}

export async function lipSyncFilm(deps: LipSyncDeps, projectId: string, scenes: LipSyncScene[], framedOf: (keys: string[]) => string[]): Promise<LipSyncOutcome> {
  const out: LipSyncOutcome = { clips: new Map(), gaps: [], made: 0, reused: 0 };
  const targets = scenes.flatMap((sc) => {
    const { shots, lines } = sceneLipSyncInputs(sc, framedOf);
    return lipSyncTargets(shots, lines).map((t) => ({ t, scene: sc }));
  });
  if (!targets.length) return out;
  if (!deps.provider) {
    out.gaps.push(degradation("LIP_SYNC_UNAVAILABLE", "film", `${targets.length} dialogue shot(s) were not lip-synced: no lip-sync provider is configured (FAL_KEY).`, { detail: { shots: targets.length } }));
    return out;
  }
  for (const { t, scene } of targets) {
    const key = lipSyncKey(projectId, t, deps.provider.model);
    try {
      if ((await deps.size(key)) > 0) {
        out.clips.set(t.shotId, key);
        out.reused++;
        continue;
      }
      const dir = await mkdtemp(join(tmpdir(), "cf-lipsync-"));
      try {
        const inputs: string[] = [];
        for (const [i, s] of t.segments.entries()) {
          const p = join(dir, `line-${i}`);
          await deps.download(s.audioKey, p);
          inputs.push(p);
        }
        const stem = join(dir, "dialogue.wav");
        await deps.ffmpeg(["-y", ...dialogueStemArgs(inputs, t.segments, t.durSec, stem)]);
        const synced = await deps.provider.sync(await deps.getBytes(t.videoKey), new Uint8Array(await readFile(stem)));
        await deps.putBytes(key, synced, "video/mp4");
        await deps.meter?.(t);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
      out.clips.set(t.shotId, key);
      out.made++;
    } catch (e) {
      out.gaps.push(degradation("LIP_SYNC_FAILED", "shot", `Scene ${scene.index + 1}: a dialogue shot keeps its original clip; lip sync failed.`, {
        refId: t.shotId, detail: { reason: (e instanceof Error ? e.message : String(e)).slice(0, 200), speechSec: t.speechSec },
      }));
    }
  }
  return out;
}

/**
 * Subject keys (char_maya) → database character ids, through the film's cast
 * names (pure). Characters are stored by name; the Film IR names them by key.
 */
export function framedFromCast(cast: { id: string; name: string }[], rows: { id: string; name: string }[]): (keys: string[]) => string[] {
  const byName = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r.id]));
  const byKey = new Map(cast.map((c) => [c.id, byName.get(c.name.trim().toLowerCase())]));
  return (keys) => keys.map((k) => byKey.get(k)).filter((x): x is string => !!x);
}
