import { prisma } from "@cineforge/db";

/**
 * Director AI — planning service.
 *
 * Turns a project (prompt + targetSeconds) into a persisted, production-ready
 * plan: screenplay, Character/World Bible, scenes, and shots. The film
 * processor then fans these out onto the queues.
 *
 * NOTE: the structural planner below (duration -> scene/shot counts) is real and
 * deterministic; the *content* (headings, descriptions, dialogue) is generated
 * by a stub here. Replace `draftWithLLM()` with the multi-pass Claude calls in
 * docs/05-director-ai.md (use the claude-api skill for current model ids +
 * structured output). The shapes it writes already match the schema, so wiring
 * the real LLM does not change the fan-out.
 */

const AVG_SCENE_SEC = 18;
const AVG_SHOT_SEC = 5;
const MAX_SCENES = 400; // safety cap for very long films

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

    const sceneCount = Math.min(
      MAX_SCENES,
      Math.max(1, Math.round(project.targetSeconds / AVG_SCENE_SEC)),
    );
    const shotsPerScene = Math.max(1, Math.ceil(AVG_SCENE_SEC / AVG_SHOT_SEC));

    const draft = draftWithLLM(project.prompt, sceneCount);

    // World + Character Bible (canonical, reusable — see docs/07, 08).
    const location = await prisma.location.create({
      data: {
        projectId,
        name: draft.location.name,
        kind: "EXTERIOR",
        description: draft.location.description,
      },
    });
    const protagonist = await prisma.character.create({
      data: {
        projectId,
        name: draft.protagonist.name,
        appearance: draft.protagonist.appearance,
      },
    });

    await prisma.screenplay.upsert({
      where: { projectId },
      create: {
        projectId,
        logline: draft.logline,
        synopsis: draft.synopsis,
        acts: draft.acts,
        raw: draft.raw,
      },
      update: { logline: draft.logline, synopsis: draft.synopsis, acts: draft.acts, raw: draft.raw },
    });

    // Scenes + shots. Create per-scene with nested shots so we get ids back for
    // the queue fan-out. Upsert-by-index keeps re-runs idempotent.
    const scenes: PlannedScene[] = [];
    for (let i = 0; i < sceneCount; i++) {
      const heading = `EXT. ${draft.location.name.toUpperCase()} - ${i % 2 ? "NIGHT" : "DAY"}`;
      const summary = draft.sceneSummary(i);

      // Clean any prior shots/scene for idempotency, then recreate.
      await prisma.scene.deleteMany({ where: { projectId, index: i } });
      const scene = await prisma.scene.create({
        data: {
          projectId,
          index: i,
          locationId: location.id,
          heading,
          summary,
          timeOfDay: i % 2 ? "night" : "day",
          characters: { create: [{ characterId: protagonist.id }] },
          shots: {
            create: Array.from({ length: shotsPerScene }, (_, s) => ({
              index: s,
              prompt: buildShotPrompt(draft, location.description, protagonist.appearance, i, s),
              negativePrompt: "blurry, watermark, text, extra limbs, deformed",
              durationSec: AVG_SHOT_SEC,
              modelId: project.modelId,
            })),
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

/** STUB for the multi-pass LLM (docs/05). Deterministic placeholder content. */
function draftWithLLM(prompt: string, sceneCount: number) {
  const title = prompt.slice(0, 60);
  return {
    logline: `A story generated from: ${title}`,
    synopsis: `An auto-generated synopsis for "${title}", told across ${sceneCount} scenes.`,
    acts: [{ act: 1, scenes: Array.from({ length: sceneCount }, (_, i) => i) }] as unknown as object,
    raw: { prompt } as unknown as object,
    location: { name: "The Kingdom", description: "a vast sunlit African kingdom of red earth and stone" },
    protagonist: { name: "Adisa", appearance: "a regal warrior, dark skin, gold-threaded robes, close-cropped hair" },
    sceneSummary: (i: number) => `Beat ${i + 1}: the conflict deepens toward independence.`,
  };
}

function buildShotPrompt(
  draft: ReturnType<typeof draftWithLLM>,
  locationDesc: string,
  appearance: string,
  sceneIndex: number,
  shotIndex: number,
): string {
  // Prompt Builder composition (docs/09): bible + continuity + camera. The
  // continuity lookup is omitted in this stub.
  const sizes = ["wide establishing shot", "medium shot", "close-up", "tracking shot"];
  return [
    "cinematic, film still,",
    sizes[shotIndex % sizes.length] + " of",
    appearance,
    "in",
    locationDesc + ".",
    draft.sceneSummary(sceneIndex),
  ].join(" ");
}
