/**
 * A dubbed language as a real master (DirectorOS W22; Part 3 §111, §117.3).
 *
 * A dub used to swap the finished film's whole soundtrack for the translated
 * voice: the music, the ambience and the effects were lost, and the mouths
 * still spoke the original language. Now each language is rendered by the
 * same engine as the film:
 *
 *   picture   the film's clips in its cut (a locked film's frozen timeline,
 *             W19), with each dialogue shot lip-synced to the TRANSLATED
 *             line when LIP_SYNC=1 (W21)
 *   sound     the dubbed scene tracks in place of the original voice, under
 *             the same music, ambience and effects, mixed by the production
 *             profile
 *   gate      the same Final Quality Gate as the original
 *
 * to projects/<id>/film/<lang>/final.mp4. DUB_MIX=0 keeps the old voice swap.
 */
import { prisma } from "@cineforge/db";
import type { Degradation } from "@cineforge/shared";
import type { GateResult } from "../quality/gates";
import { RenderEngine, type SceneAssets } from "../ffmpeg/render-engine";
import { S3Storage } from "../storage/storage";
import { applyCut, cutFromTimeline } from "../timeline/lock";
import { brandOutro, masterGate, renderProfile } from "../render/profile";
import { sceneAssetsOf, type DubbedScene, type RenderSceneRow } from "../render/inputs";
import { lipSyncPass } from "../render/lip-sync-pass";

export function dubMixEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DUB_MIX !== "0";
}

export interface DubbedFilm {
  mp4Key: string;
  posterKey: string;
  sha256: string;
  lipSynced: number;
  gaps: Degradation[];
  quality: GateResult[];
}

/** The film's scenes, as the render reads them. */
export async function loadRenderScenes(projectId: string): Promise<RenderSceneRow[]> {
  return prisma.scene.findMany({
    where: { projectId },
    orderBy: { index: "asc" },
    include: {
      shots: { orderBy: { index: "asc" } }, audioTracks: true,
      dialogueLines: { orderBy: { index: "asc" }, select: { id: true, characterId: true, audioKey: true, startMs: true } },
    },
  }) as unknown as Promise<RenderSceneRow[]>;
}

/** The pure part (tested): a dub's assets — lip-synced clips where there are some, the dubbed voice per scene. */
export function dubAssets(scenes: RenderSceneRow[], dubbed: Map<string, DubbedScene>, lipClips: Map<string, string>): SceneAssets[] {
  return sceneAssetsOf(scenes, {
    clipOf: (sh) => lipClips.get(sh.id) ?? sh.videoKey,
    voiceOf: (sceneId) => dubbed.get(sceneId)?.trackKey,
  });
}

export async function renderDubbedFilm(projectId: string, language: string, dubbed: Map<string, DubbedScene>): Promise<DubbedFilm> {
  const scenes = await loadRenderScenes(projectId);
  const missing = scenes.flatMap((s) => s.shots.filter((sh) => !sh.videoKey)).length;
  if (!scenes.length || missing) throw new Error(missing ? `${missing} shot(s) have no clip` : "the film has no scenes");
  const lip = await lipSyncPass(projectId, scenes, { language, scenes: dubbed });
  let assets = dubAssets(scenes, dubbed, lip.clips);
  let filmSec = scenes.reduce((a, s) => a + s.durationSec, 0);
  // A locked film's dub follows the timeline the film was delivered from (W19).
  const frozen = await prisma.productionTimeline.findFirst({ where: { projectId, status: "frozen" }, orderBy: { version: "desc" }, select: { id: true } }).catch(() => null);
  const locked = await prisma.project.findUnique({ where: { id: projectId }, select: { lockedAt: true } });
  if (frozen && locked?.lockedAt) {
    const events = await prisma.timelineEvent.findMany({ where: { timelineVersionId: frozen.id }, select: { kind: true, refId: true, startUs: true, endUs: true } });
    const cut = cutFromTimeline(events, new Map(scenes.flatMap((s) => s.shots.map((sh) => [sh.id, s.id] as const))));
    assets = applyCut(assets, cut, new Map(scenes.flatMap((s) => s.shots.map((sh) => [sh.id, lip.clips.get(sh.id) ?? sh.videoKey] as const))));
    filmSec = cut.durationSec;
  }
  const profile = renderProfile();
  const out = await new RenderEngine(new S3Storage()).renderFinal(projectId, assets, undefined, await brandOutro(projectId), {
    filmSec, gate: masterGate(filmSec, profile.delivery), mix: profile.mix, delivery: profile.delivery, dir: `projects/${projectId}/film/${language}`,
  });
  return { mp4Key: out.mp4Key, posterKey: out.posterKey, sha256: out.sha256, lipSynced: lip.clips.size, gaps: [...lip.gaps, ...out.degradations], quality: out.quality };
}
