import { prisma } from "@cineforge/db";
import {
  DEFAULT_PRODUCTION,
  isStillMotion,
  outputDimensions,
  ProductionFailure,
  degradation,
  type Degradation,
  type ProductionSpec,
} from "@cineforge/shared";
import { MODEL_VERSIONS } from "@cineforge/model-adapters";
import {
  canonVersion,
  checkFilmContinuity,
  audioAdvisories,
  cinemaAdvisories,
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
import type { GateResult } from "../quality/gates";
import { chosenVoiceId } from "../voice/film";
import { snapshotScenes, writeShotDependencies, type PlanHistoryDb } from "../versions/plan";
import { constraintsFor, NO_CANON, planProductionFor, productionOf, renderStyleFor, type ProductionCanon, type ProductionRow } from "./production";
import { loadProductionCanon, type CardRef, type StudioDb } from "./studio";

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
  /** Story and continuity gates of the plan (W5 gate chain) — recorded by the caller. */
  gates: GateResult[];
}

/**
 * The plan must fit what was estimated and charged (scene count, shot budget,
 * runtime). A live-action film plans exactly as before W11; other formats are
 * paced by their production profile (./production.ts).
 */
export function planningConstraints(targetSeconds: number, spec: ProductionSpec = DEFAULT_PRODUCTION, canon: ProductionCanon = NO_CANON): ProductionConstraints {
  return constraintsFor(targetSeconds, spec, canon);
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
      select: {
        prompt: true, targetSeconds: true, modelId: true, resolution: true, aspectRatio: true,
        kind: true, medium: true, animationStyle: true, episodes: true, seriesId: true, episodeNumber: true, title: true,
      },
    });
    const spec = productionOf(project);
    // W12: cast cards, the show bible and what earlier episodes established.
    const canon = await loadProductionCanon(prisma as unknown as StudioDb, projectId, spec);
    const constraints = planningConstraints(project.targetSeconds, spec, canon);

    // 1–2: plan + validate (+ one revision). Fails instead of inventing.
    let plan: PlanResult;
    const router = intelligence();
    try {
      if (!router.available("film_plan") && process.env.DIRECTOR_ALLOW_STUB === "1") {
        plan = { pkg: stubPackage(project.prompt, constraints), revised: false, fixedIssues: [], provider: "stub", model: "stub" };
      } else {
        plan = await planFilm(router, project.prompt, constraints, { projectId, production: planProductionFor(spec, canon) });
      }
    } catch (e) {
      throw toProductionFailure(e) ?? e;
    }
    console.log(JSON.stringify({
      event: "director.planned", projectId, provider: plan.provider, model: plan.model, revised: plan.revised,
      fixed: plan.fixedIssues.length, scenes: plan.pkg.scenes.length, cast: plan.pkg.cast.length,
    }));

    // 3: compile + persist.
    const scenes = await persistPlan(projectId, project, plan, canon.cards);
    return { projectId, modelId: project.modelId, scenes, degradations: planDegradations(plan.pkg, project.modelId), gates: planGates(plan) };
  }
}

/**
 * The plan's place in the gate chain: it reached here only by passing the
 * story and canon validators (a revision counts as a warning); continuity
 * warnings across every planned shot are listed.
 */
export function planGates(plan: Pick<PlanResult, "pkg" | "revised" | "fixedIssues">): GateResult[] {
  const story: GateResult = {
    gate: "story",
    outcome: plan.revised ? "warn" : "pass",
    findings: plan.revised
      ? [{ code: "PLAN_REVISED", severity: "warn", message: `the first plan had ${plan.fixedIssues.length} issue(s); the revision fixed them`, detail: { issues: plan.fixedIssues.slice(0, 20).map((i) => `${i.stage}/${i.code}`) } }]
      : [],
  };
  const warnings = checkFilmContinuity(plan.pkg).flatMap(({ sceneId, shotIndex, result }) =>
    result.violations.map((v) => ({ code: v.code, severity: "warn" as const, message: `${sceneId}#${shotIndex}: ${v.message}` })));
  const continuity: GateResult = { gate: "continuity", outcome: warnings.length ? "warn" : "pass", findings: warnings.slice(0, 50) };
  return [story, continuity];
}

/** What the plan records but does not fail on: film-grammar and audio-continuity advisories, and model prompt limits (W4, W14). */
export function planDegradations(pkg: PlanResult["pkg"], modelId: string): Degradation[] {
  const out: Degradation[] = cinemaAdvisories(pkg).map((a) =>
    degradation("CINEMA_ADVISORY", "shot", a.message, { refId: `${a.sceneId}#${a.shotIndex}`, detail: { code: a.code } }));
  // Audio continuity (W14; §32.6): ambience, music and room tone across scenes.
  for (const a of audioAdvisories(pkg)) {
    out.push(degradation("AUDIO_CONTINUITY", "scene", a.message, { refId: a.sceneId, detail: { code: a.code, against: a.againstSceneId } }));
  }
  for (const sc of compileFilm(pkg, { modelId }).scenes) {
    for (const sh of sc.shots) {
      if (sh.promptDropped.length) {
        out.push(degradation("PROMPT_LIMITED", "shot", `The ${modelId} prompt for ${sc.key} shot ${sh.index} leaves out part of the plan.`, {
          refId: `${sc.key}#${sh.index}`, detail: { dropped: sh.promptDropped },
        }));
      }
    }
  }
  return out;
}

/**
 * Voices the owner already gave characters of the same name in their other
 * productions or the Casting Room (W7b): a planned "Maya" speaks in the voice
 * the owner chose for Maya. The newest choice wins; the scene voice step
 * still checks ownership, readiness and consent before using it.
 */
async function castVoices(projectId: string): Promise<Map<string, string>> {
  const owner = await prisma.project.findUnique({ where: { id: projectId }, select: { userId: true } });
  if (!owner) return new Map();
  const rows = await prisma.character.findMany({
    where: { project: { userId: owner.userId }, NOT: { projectId } },
    orderBy: { updatedAt: "desc" },
    select: { name: true, voiceProfile: true },
  });
  const out = new Map<string, string>();
  for (const r of rows) {
    const id = chosenVoiceId(r.voiceProfile);
    const key = r.name.trim().toLowerCase();
    if (id && !out.has(key)) out.set(key, id);
  }
  return out;
}

/**
 * A series (W11; Part 5 §178.2): the plan's acts are its episodes. The series,
 * season 1 and one episode per act are kept (updated on a re-plan, never
 * duplicated), and every scene is linked to its episode. Returns act → episode id.
 */
async function persistEpisodes(projectId: string, pkg: PlanResult["pkg"]): Promise<Map<number, string>> {
  const series = await prisma.series.upsert({
    where: { projectId },
    create: { projectId, title: pkg.film.title, synopsis: pkg.film.synopsis },
    update: { title: pkg.film.title, synopsis: pkg.film.synopsis },
    select: { id: true },
  });
  const season = await prisma.season.upsert({
    where: { seriesId_number: { seriesId: series.id, number: 1 } },
    create: { seriesId: series.id, number: 1, title: "Season 1" },
    update: {},
    select: { id: true },
  });
  const out = new Map<number, string>();
  for (const act of pkg.acts) {
    const ep = await prisma.episode.upsert({
      where: { seasonId_number: { seasonId: season.id, number: act.index } },
      create: { seasonId: season.id, number: act.index, title: `Episode ${act.index}`, synopsis: act.purpose },
      update: { synopsis: act.purpose },
      select: { id: true },
    });
    out.set(act.index, ep.id);
  }
  return out;
}

/**
 * An episode production (W12; Part 5 §184): its plan is one episode of the
 * show — kept as that number in season 1, pointing at this production (a
 * remake of the number takes it over). Every act's scenes link to it.
 */
async function persistShowEpisode(projectId: string, seriesId: string, number: number, pkg: PlanResult["pkg"]): Promise<Map<number, string>> {
  const season = await prisma.season.upsert({
    where: { seriesId_number: { seriesId, number: 1 } },
    create: { seriesId, number: 1, title: "Season 1" },
    update: {},
    select: { id: true },
  });
  const ep = await prisma.episode.upsert({
    where: { seasonId_number: { seasonId: season.id, number } },
    create: { seasonId: season.id, number, title: pkg.film.title, synopsis: pkg.film.synopsis, projectId },
    update: { title: pkg.film.title, synopsis: pkg.film.synopsis, projectId },
    select: { id: true },
  });
  return new Map(pkg.acts.map((a) => [a.index, ep.id]));
}

/** Compile and persist a plan (exported for the database integration test). */
export async function persistPlan(
  projectId: string,
  project: { modelId: string; resolution: string; aspectRatio: string; title?: string } & ProductionRow,
  plan: PlanResult,
  cards: Map<string, CardRef> = new Map(),
): Promise<PlannedScene[]> {
  const pkg = plan.pkg;
  const spec = productionOf(project);
  // Animation (W11): every shot prompt is drawn in the production's style.
  const compiled = compileFilm(pkg, { modelId: project.modelId, render: renderStyleFor(spec) });
  const [width, height] = outputDimensions(project.resolution, project.aspectRatio);
  const modelVersion = MODEL_VERSIONS[project.modelId] ?? "unknown";
  // Scene stills: when OpenAI is configured, every shot starts as an image
  // (video.processor resolveSeedKey). Disable with DIRECTOR_SEED_FRAMES=0.
  // Storybook and motion comic (W12) are drawn stills by definition: every shot starts as an image.
  const seedFrames = isStillMotion(spec) || (process.env.DIRECTOR_SEED_FRAMES !== "0" && !!process.env.OPENAI_API_KEY);

  // Canon. `select: { id }` keeps each INSERT … RETURNING to columns every
  // deployed schema has (a full return also read characters.lora_sha256,
  // which needs migration 0027).
  const charId = new Map<string, string>();
  const voices = await castVoices(projectId);
  const irCast = new Map(pkg.cast.map((c) => [c.id, c]));
  for (const c of compiled.characters) {
    // A character cast from a Character Card (W12) speaks in the card's voice and links back to it.
    const card = cards.get(c.key);
    const voiceId = chosenVoiceId(card?.voiceProfile) ?? voices.get(c.name.trim().toLowerCase());
    const design = irCast.get(c.key)?.design ?? null;
    const row = await prisma.character.create({
      data: {
        projectId, name: c.name, age: c.age, gender: c.gender, appearance: c.appearance,
        personality: c.personality, arc: c.arc, voiceProfile: voiceId ? { ...c.voiceProfile, voiceId } : c.voiceProfile,
        ...(design ? { design } : {}),
        ...(card ? {
          sourceCharacterId: card.cardId, heightCm: card.card.heightCm, hair: card.card.hair, eyes: card.card.eyes, clothing: card.card.clothing,
        } : {}),
        ...(spec.animationStyle ? { animationStyle: spec.animationStyle } : {}),
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
  const episodeOfAct = spec.kind === "series"
    ? await persistEpisodes(projectId, pkg)
    : spec.kind === "episode"
      ? await persistShowEpisode(projectId, spec.seriesId!, spec.episodeNumber!, pkg)
      : new Map<number, string>();
  const out: PlannedScene[] = [];
  // A re-plan replaces scenes: keep each one as it was first (W8b, append-only plan history).
  await snapshotScenes(prisma as unknown as PlanHistoryDb, projectId, { indexes: compiled.scenes.map((s) => s.index) }, "replan", raw.canonVersion);
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
        ...(episodeOfAct.has(sc.act) ? { episodeId: episodeOfAct.get(sc.act)! } : {}),
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
  // Dependency edges (W8b): what each shot depends on, so an edit touches only those shots.
  const byIndex = new Map(out.map((sc) => [sc.index, new Map(sc.shots.map((sh) => [sh.index, sh.id]))]));
  await writeShotDependencies(prisma as unknown as PlanHistoryDb, projectId, pkg, (si, hi) => byIndex.get(si)?.get(hi), raw.canonVersion);
  return out;
}
