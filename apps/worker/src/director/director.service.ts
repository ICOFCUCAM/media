import { prisma } from "@cineforge/db";
import {
  AVG_SHOT_SEC,
  planSceneCount,
  planShotsPerScene,
  outputDimensions,
  ProductionFailure,
  type Degradation,
} from "@cineforge/shared";
import { MODEL_VERSIONS } from "@cineforge/model-adapters";
import {
  canonVersion,
  compileFilm,
  IntelligenceError,
  PlanInvalidError,
  planFilm,
  type PlanResult,
  type ProductionConstraints,
} from "@cineforge/movie";
import { intelligence } from "../intelligence";
import { stubPackage } from "./stub";
import { shotGenerationFields, statePatchRow } from "./rows";

/**
 * Director — planning service (DirectorOS W2: One-Pass Intelligence /
 * Multi-Pass Execution, Part 2 §85–99).
 *
 *  1. ONE master call through the provider-neutral router returns the complete
 *     Film Production Package (Film IR): bible, cast, world, props, acts,
 *     threads, setups, scenes, dialogue, shots, audio plan.
 *  2. The validator chain checks it; if it fails, ONE surgical revision call
 *     fixes exactly the reported issues; still invalid → the film fails.
 *  3. The deterministic Production Compiler turns the package into rows: the
 *     whole cast and world, structured dialogue, shots with their planned
 *     length and camera. The package itself is kept in `screenplays.raw`.
 *
 * Nothing here talks to a model vendor directly, and no prompt string is
 * built here (shot prompts come from the compiler).
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
  /** Gaps in the plan — recorded by the caller. */
  degradations: Degradation[];
}

/** The plan must fit what was estimated and charged (scene count, shot budget, runtime). */
export function planningConstraints(targetSeconds: number): ProductionConstraints {
  const sceneCount = planSceneCount(targetSeconds);
  return {
    sceneCount,
    sceneSec: Math.max(2, Math.round(targetSeconds / sceneCount)),
    sceneTolerance: 0.15,
    maxShotsPerScene: planShotsPerScene(),
    maxShotSec: AVG_SHOT_SEC,
    targetSeconds,
    filmTolerance: 0.15,
  };
}

/** Planning failures in the vocabulary the film processor reports. */
export function toProductionFailure(e: unknown): ProductionFailure | null {
  if (e instanceof PlanInvalidError) {
    return new ProductionFailure("DIRECTOR_OUTPUT_INVALID", e.message, {
      issues: e.issues.slice(0, 20).map((i) => `${i.stage}/${i.code} ${i.path}: ${i.message}`),
    });
  }
  if (e instanceof IntelligenceError) {
    if (e.code === "REFUSED") return new ProductionFailure("DIRECTOR_REFUSED", e.message, e.detail);
    if (e.code === "TRUNCATED" || e.code === "NO_STRUCTURED_OUTPUT") {
      return new ProductionFailure("DIRECTOR_OUTPUT_INVALID", e.message, { code: e.code });
    }
    return new ProductionFailure("DIRECTOR_UNAVAILABLE", e.message, { code: e.code });
  }
  return null;
}

export class DirectorService {
  /** Plan the whole film and persist it. */
  async plan(projectId: string): Promise<FilmPlan> {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { prompt: true, targetSeconds: true, modelId: true, resolution: true, aspectRatio: true },
    });
    const constraints = planningConstraints(project.targetSeconds);

    // 1–2: plan + validate (+ one revision). Fails instead of inventing.
    let plan: PlanResult;
    const router = intelligence();
    try {
      if (!router.available("film_plan") && process.env.DIRECTOR_ALLOW_STUB === "1") {
        plan = { pkg: stubPackage(project.prompt, constraints), revised: false, fixedIssues: [], provider: "stub", model: "stub" };
      } else {
        plan = await planFilm(router, project.prompt, constraints, { projectId });
      }
    } catch (e) {
      throw toProductionFailure(e) ?? e;
    }
    console.log(JSON.stringify({
      event: "director.planned", projectId, provider: plan.provider, model: plan.model, revised: plan.revised,
      fixed: plan.fixedIssues.length, scenes: plan.pkg.scenes.length, cast: plan.pkg.cast.length,
    }));

    // 3: compile + persist.
    const scenes = await persistPlan(projectId, project, plan);
    return { projectId, modelId: project.modelId, scenes, degradations: [] };
  }
}

/** Compile and persist a plan (exported for the database integration test). */
export async function persistPlan(
  projectId: string,
  project: { modelId: string; resolution: string; aspectRatio: string },
  plan: PlanResult,
): Promise<PlannedScene[]> {
  const pkg = plan.pkg;
  const compiled = compileFilm(pkg);
  const [width, height] = outputDimensions(project.resolution, project.aspectRatio);
  const modelVersion = MODEL_VERSIONS[project.modelId] ?? "unknown";
  // Scene stills: when OpenAI is configured, every shot starts as an image
  // (video.processor resolveSeedKey). Disable with DIRECTOR_SEED_FRAMES=0.
  const seedFrames = process.env.DIRECTOR_SEED_FRAMES !== "0" && !!process.env.OPENAI_API_KEY;

  // Canon. `select: { id }` keeps each INSERT … RETURNING to columns every
  // deployed schema has (a full return also read characters.lora_sha256,
  // which needs migration 0027).
  const charId = new Map<string, string>();
  for (const c of compiled.characters) {
    const row = await prisma.character.create({
      data: {
        projectId, name: c.name, age: c.age, gender: c.gender, appearance: c.appearance,
        personality: c.personality, arc: c.arc, voiceProfile: c.voiceProfile,
      },
      select: { id: true },
    });
    charId.set(c.key, row.id);
  }
  const locId = new Map<string, string>();
  for (const l of compiled.locations) {
    const row = await prisma.location.create({
      data: { projectId, name: l.name, kind: l.kind, description: l.description },
      select: { id: true },
    });
    locId.set(l.key, row.id);
  }
  for (const p of compiled.props) {
    await prisma.worldObject.create({
      data: { projectId, name: p.name, description: p.description, category: "prop" },
      select: { id: true },
    });
  }

  const raw = {
    irVersion: pkg.irVersion,
    canonVersion: canonVersion(pkg),
    package: pkg,
    plan: { provider: plan.provider, model: plan.model, revised: plan.revised, fixedIssues: plan.fixedIssues.length },
  };
  const sp = compiled.screenplay;
  await prisma.screenplay.upsert({
    where: { projectId },
    create: { projectId, logline: sp.logline, synopsis: sp.synopsis, genre: sp.genre, tone: sp.tone, acts: sp.acts, raw },
    update: { logline: sp.logline, synopsis: sp.synopsis, genre: sp.genre, tone: sp.tone, acts: sp.acts, raw },
    select: { id: true },
  });

  const keying = { projectId, modelId: project.modelId, modelVersion, width, height };
  const out: PlannedScene[] = [];
  for (const sc of compiled.scenes) {
    await prisma.scene.deleteMany({ where: { projectId, index: sc.index } });
    const scene = await prisma.scene.create({
      data: {
        projectId,
        index: sc.index,
        locationId: locId.get(sc.locationKey)!,
        heading: sc.heading,
        summary: sc.summary,
        narration: sc.narration,
        dialogue: sc.dialogueText,
        timeOfDay: sc.timeOfDay,
        mood: sc.mood,
        music: sc.music,
        camera: sc.camera,
        characterRef: sc.characterRef,
        locationNote: compiled.locations.find((l) => l.key === sc.locationKey)!.name,
        bridge: sc.bridge,
        statePatch: statePatchRow(sc, charId),
        dependsOn: sc.index > 0 ? [sc.index - 1] : [],
        characters: { create: sc.characterKeys.map((k) => ({ characterId: charId.get(k)! })) },
        dialogueLines: {
          create: sc.dialogue.map((d) => ({ index: d.index, characterId: charId.get(d.characterKey)!, text: d.text, emotion: d.emotion })),
        },
        shots: {
          create: sc.shots.map((sh) => ({
            index: sh.index,
            ...shotGenerationFields(keying, sc.index, sh, charId),
            source: seedFrames ? "image" : "text",
            durationSec: sh.durationSec,
            cameraPlan: sh.cameraPlan,
            cameraType: sh.cameraType,
            cameraMovement: sh.cameraMovement,
            modelId: project.modelId,
            modelVersion,
          })),
        },
      },
      select: { id: true, index: true, shots: { orderBy: { index: "asc" }, select: { id: true, index: true } } },
    });
    out.push({ id: scene.id, index: scene.index, shots: scene.shots });
  }
  return out;
}
