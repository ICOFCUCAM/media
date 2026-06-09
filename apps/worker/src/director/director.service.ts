import { prisma } from "@cineforge/db";
import {
  AVG_SHOT_SEC,
  planSceneCount,
  planShotsPerScene,
  computePromptHash,
  computeCacheKey,
  deterministicSeed,
  autoContinuity,
  statePatchFrom,
  type SceneBridge,
} from "@cineforge/shared";
import { MODEL_VERSIONS } from "@cineforge/model-adapters";
import { draftFilm, type FilmDraft } from "./llm";

/**
 * Director AI — planning service.
 *
 * Turns a project (prompt + targetSeconds) into a persisted, production-ready
 * plan: screenplay, Character/World Bible, scenes, and shots. The content is
 * authored by Claude (see ./llm.ts) and is what makes shot prompts bible-aware;
 * the structural planner (duration -> scene/shot counts), provenance and cache
 * keys are deterministic. The film processor then fans these onto the queues.
 */

export interface PlannedShot {
  id: string;
  index: number;
}
export interface PlannedScene {
  id: string;
  index: number;
  shots: PlannedShot[];
}
export interface FilmPlan {
  projectId: string;
  modelId: string;
  scenes: PlannedScene[];
}

export class DirectorService {
  /** Plan the whole film and persist it. Idempotent per project. */
  async plan(projectId: string): Promise<FilmPlan> {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

    const sceneCount = planSceneCount(project.targetSeconds);
    const shotsPerScene = planShotsPerScene();
    const [width, height] = project.aspectRatio === "9:16" ? [720, 1280] : [1280, 720];
    const modelVersion = MODEL_VERSIONS[project.modelId] ?? "unknown";

    // Director writes the screenplay + bible (Claude, or deterministic fallback).
    const draft = await draftFilm(project.prompt, sceneCount);

    // World + Character Bible (canonical, reusable — see docs/07, 08).
    const location = await prisma.location.create({
      data: {
        projectId,
        name: draft.location.name,
        kind: draft.location.kind,
        description: draft.location.description,
      },
    });
    const protagonist = await prisma.character.create({
      data: {
        projectId,
        name: draft.protagonist.name,
        age: draft.protagonist.age,
        gender: draft.protagonist.gender,
        appearance: draft.protagonist.appearance,
        personality: draft.protagonist.personality,
      },
    });

    const acts = [{ act: 1, scenes: draft.scenes.map((_, i) => i) }] as unknown as object;
    await prisma.screenplay.upsert({
      where: { projectId },
      create: { projectId, logline: draft.logline, synopsis: draft.synopsis, genre: draft.genre, tone: draft.tone, acts, raw: draft.raw as object },
      update: { logline: draft.logline, synopsis: draft.synopsis, genre: draft.genre, tone: draft.tone, acts, raw: draft.raw as object },
    });

    // Continuity Engine (docs/28): the Director proposes a Scene Bridge + the
    // state each scene changes, derived from its own beats, so the film starts
    // with a populated Project Memory Graph that carries forward consistently.
    const auto = autoContinuity(
      draft.scenes.map((b, i) => ({ index: i, heading: b.heading, summary: b.summary, character: protagonist.name, location: location.name })),
    );

    // Scenes + shots. Create per-scene with nested shots so we get ids back for
    // the queue fan-out. Delete-by-index keeps re-runs idempotent.
    const scenes: PlannedScene[] = [];
    for (let i = 0; i < sceneCount; i++) {
      const beat = draft.scenes[i]!;
      const ac = auto[i]!;
      // Prefer the Director's own continuity; fall back to the deterministic
      // derivation field-by-field so blanks are always filled.
      const bridge: SceneBridge = {
        whatJustHappened: beat.bridge?.whatJustHappened?.trim() || ac.bridge.whatJustHappened,
        whatChanged: beat.bridge?.whatChanged?.trim() || ac.bridge.whatChanged,
        whatCarriesForward: beat.bridge?.whatCarriesForward?.trim() || ac.bridge.whatCarriesForward,
        nextSceneRequirements: beat.bridge?.nextSceneRequirements?.trim() || ac.bridge.nextSceneRequirements,
      };
      const statePatch = statePatchFrom({
        character: protagonist.name,
        location: location.name,
        emotion: beat.state?.emotion || ac.emotion,
        health: beat.state?.health || ac.health,
        season: beat.state?.season || ac.season,
        locationStatus: beat.state?.locationStatus || ac.locationStatus,
        goal: beat.state?.goal || ac.goal,
        // Visual continuity: every scene references the SAME character asset id;
        // wardrobe carries forward unless the Director changes it.
        assetId: protagonist.id,
        wardrobe: beat.state?.wardrobe,
      });

      await prisma.scene.deleteMany({ where: { projectId, index: i } });
      const scene = await prisma.scene.create({
        data: {
          projectId,
          index: i,
          locationId: location.id,
          heading: beat.heading,
          summary: beat.summary,
          timeOfDay: beat.timeOfDay,
          characterRef: protagonist.name,
          locationNote: location.name,
          bridge: bridge as unknown as object,
          statePatch: statePatch as unknown as object,
          dependsOn: i > 0 ? [i - 1] : [],
          characters: { create: [{ characterId: protagonist.id }] },
          shots: {
            create: Array.from({ length: shotsPerScene }, (_, s) => {
              // Prompt Builder composition (docs/09): bible + scene beat + camera.
              const prompt = buildShotPrompt(beat.summary, draft, s);
              const negativePrompt = "blurry, watermark, text, extra limbs, deformed";
              const seed = deterministicSeed(projectId, i, s);
              const promptHash = computePromptHash({ prompt, negativePrompt });
              // Provenance + content-addressed cache key (docs/24 §C7): identical
              // inputs across a re-render reuse the existing clip with no GPU spend.
              const cacheKey = computeCacheKey({
                modelId: project.modelId,
                modelVersion,
                promptHash,
                seed,
                width,
                height,
                durationSec: AVG_SHOT_SEC,
                referenceKeys: protagonist.referenceUrls,
                loraKey: protagonist.loraKey ?? undefined,
              });
              return {
                index: s,
                prompt,
                negativePrompt,
                durationSec: AVG_SHOT_SEC,
                modelId: project.modelId,
                modelVersion,
                promptHash,
                cacheKey,
                seed: BigInt(seed),
              };
            }),
          },
        },
        include: { shots: { orderBy: { index: "asc" } } },
      });

      scenes.push({
        id: scene.id,
        index: scene.index,
        shots: scene.shots.map((sh) => ({ id: sh.id, index: sh.index })),
      });
    }

    return { projectId, modelId: project.modelId, scenes };
  }
}

/** Compose a shot prompt from the Director's bible + scene beat + camera. */
function buildShotPrompt(sceneSummary: string, draft: FilmDraft, shotIndex: number): string {
  const sizes = ["wide establishing shot", "medium shot", "close-up", "tracking shot"];
  return [
    "cinematic, film still,",
    sizes[shotIndex % sizes.length] + " of",
    draft.protagonist.appearance,
    "in",
    draft.location.description + ".",
    sceneSummary,
  ].join(" ");
}
