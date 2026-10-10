/**
 * The lip-sync pass before a render (W21), for the film's own dialogue or a
 * dubbed language's (W22). LIP_SYNC=1 turns it on; it never blocks: the
 * shots it cannot lip-sync keep their clips and the gaps are returned.
 */
import { prisma } from "@cineforge/db";
import type { Degradation } from "@cineforge/shared";
import { meter } from "../billing";
import { loadFilmPackage, type CanonDb } from "../canon/revision";
import { ffmpeg } from "../ffmpeg/ffmpeg";
import { lipSyncProvider } from "../lipsync/provider";
import { framedFromCast, lipSyncEnabled, lipSyncFilm } from "../lipsync/run";
import { S3Storage } from "../storage/storage";
import { lipSyncScenesOf, type DubbedScene, type RenderSceneRow } from "./inputs";

export async function lipSyncPass(
  projectId: string,
  scenes: RenderSceneRow[],
  dub?: { language: string; scenes: Map<string, DubbedScene> },
): Promise<{ clips: Map<string, string>; gaps: Degradation[] }> {
  if (!lipSyncEnabled() || !process.env.S3_ENDPOINT) return { clips: new Map(), gaps: [] };
  try {
    const storage = new S3Storage();
    const pkg = await loadFilmPackage(prisma as unknown as CanonDb, projectId).catch(() => null);
    const framedOf = pkg
      ? framedFromCast(pkg.cast, await prisma.character.findMany({ where: { projectId }, select: { id: true, name: true } }))
      : () => [];
    const provider = lipSyncProvider();
    const ls = await lipSyncFilm({
      provider,
      download: (k, d) => storage.download(k, d), getBytes: (k) => storage.getBytes(k),
      putBytes: (k, b, ct) => storage.putBytes(k, b, ct), size: (k) => storage.size(k), ffmpeg: (a) => ffmpeg(a),
      meter: async (t) => {
        await meter({ kind: "video", provider: "fal", model: provider?.model ?? "lipsync", unit: "requests", units: 1, projectId,
          meta: { purpose: "lip_sync", shotId: t.shotId, speechSec: t.speechSec, ...(dub ? { language: dub.language } : {}) } });
      },
    }, projectId, lipSyncScenesOf(scenes, dub?.scenes), framedOf);
    console.log(JSON.stringify({ event: "render.lip_sync", projectId, language: dub?.language ?? null, made: ls.made, reused: ls.reused, gaps: ls.gaps.length }));
    return { clips: ls.clips, gaps: dub ? ls.gaps.map((g) => ({ ...g, message: `${dub.language} dub: ${g.message}` })) : ls.gaps };
  } catch (e) {
    console.warn(`[render] lip sync skipped: ${e instanceof Error ? e.message : String(e)}`);
    return { clips: new Map(), gaps: [] };
  }
}
