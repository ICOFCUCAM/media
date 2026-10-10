/**
 * The Cinematographer's own pass (DirectorOS Part 1 §11, §26; W24).
 *
 * The master call plans the whole film; visual grammar is then held to the
 * cinema engine's advisories (no establishing wide in a new place, three
 * identical sizes, a wide straight to an extreme close-up, a flipped screen
 * direction). For each scene with advisories, the Cinematographer — a
 * separate role call — redesigns that scene's coverage. It receives only the
 * state relevant to that scene (Part 1 §92: never the whole history), and its
 * answer is kept only when the whole film still validates and the scene has
 * fewer advisories than before. Otherwise the Director's coverage stands.
 */
import { cinemaAdvisories, type CinemaAdvisory } from "../cinema/engine";
import { shotListJsonSchema, ShotList } from "../ir/json-schema";
import type { FilmPackage, FilmScene, FilmShot } from "../ir/schema";
import { validateFilmPackage, type ProductionConstraints } from "../ir/validate";
import { materializeWorld } from "../world/state";
import { PROMPTS } from "./prompts";
import type { IntelligenceRouter } from "./router";
import { clampStrings } from "./schema-compat";

/**
 * What one scene needs and nothing else (pure; Part 1 §92): the scene, the
 * people, places and props it uses, the relationships and goals of who is
 * there, the facts the audience holds, and how the previous scene ended.
 */
export function sceneState(pkg: FilmPackage, sceneIndex: number): Record<string, unknown> {
  const sc = pkg.scenes[sceneIndex]!;
  const world = materializeWorld(pkg).scenes[sceneIndex]!;
  const here = new Set(sc.characters.map((c) => c.characterId));
  const subjects = new Set([...here, ...sc.shots.flatMap((s) => s.subjectIds)]);
  const prev = pkg.scenes[sceneIndex - 1];
  const last = prev?.shots[prev.shots.length - 1];
  const loc = pkg.locations.find((l) => l.id === sc.locationId);
  return {
    look: pkg.film.visualStyle,
    scene: {
      id: sc.id, heading: sc.heading, purpose: sc.purpose, summary: sc.summary, beats: sc.beats, emotionalArc: sc.emotionalArc,
      timeOfDay: sc.timeOfDay, continuesPrevious: sc.storyTime?.continuous ?? false,
      location: loc ? { id: loc.id, name: loc.name, description: loc.description, lighting: loc.lighting } : null,
      characters: sc.characters.map((c) => ({ id: c.characterId, name: pkg.cast.find((x) => x.id === c.characterId)?.name, emotion: c.emotion, physical: c.physical, holding: c.holding })),
      lines: sc.dialogue.length,
      narration: Boolean(sc.narration?.trim()),
    },
    subjects: [...subjects],
    relationships: Object.values(world.relationships).filter((r) => here.has(r.a) || here.has(r.b)).map((r) => ({ a: r.a, b: r.b, state: r.state })),
    goals: Object.values(world.goals).filter((g) => here.has(g.characterId)).map((g) => ({ who: g.characterId, want: g.want, status: g.status })),
    audienceKnows: world.audienceKnows.map((f) => pkg.facts.find((x) => x.id === f)?.statement ?? f),
    previous: prev ? { sameLocation: prev.locationId === sc.locationId, lastShot: last ? { size: last.size, side: last.side, screenDirection: last.screenDirection } : null } : null,
  };
}

export interface CoverageRevision {
  sceneId: string;
  before: CinemaAdvisory["code"][];
  after: CinemaAdvisory["code"][];
  kept: boolean;
  /** Why the Cinematographer's answer was not kept, when it was not. */
  reason?: string;
}

export interface CoverageResult {
  pkg: FilmPackage;
  revisions: CoverageRevision[];
}

const codesIn = (pkg: FilmPackage, sceneId: string) => cinemaAdvisories(pkg).filter((a) => a.sceneId === sceneId);

/**
 * Redesign the coverage of scenes with grammar advisories, a few at a time
 * (each is one model call). Never fails the film: a failed call or a worse
 * answer leaves the Director's shots in place.
 */
export async function refineCoverage(
  router: IntelligenceRouter,
  pkg: FilmPackage,
  constraints: ProductionConstraints,
  ctx: { projectId?: string | null; maxScenes?: number } = {},
): Promise<CoverageResult> {
  if (!router.available("shot_design")) return { pkg, revisions: [] };
  const flagged = [...new Set(cinemaAdvisories(pkg).map((a) => a.sceneId))].slice(0, ctx.maxScenes ?? 4);
  let current = pkg;
  const revisions: CoverageRevision[] = [];
  const schema = shotListJsonSchema();
  const p = PROMPTS.cinemaDesign;
  for (const sceneId of flagged) {
    const i = current.scenes.findIndex((s) => s.id === sceneId);
    const sc = current.scenes[i]!;
    const before = codesIn(current, sceneId);
    const totalSec = sc.shots.reduce((n, s) => n + s.durationSec, 0);
    let shots: FilmShot[];
    try {
      const res = await router.call({
        task: "shot_design", promptId: p.id, promptVersion: p.version, system: p.system,
        user: JSON.stringify({
          state: sceneState(current, i),
          shots: sc.shots,
          problems: before.map((a) => a.message),
          keep: { totalSec, maxShots: constraints.maxShotsPerScene, maxShotSec: constraints.maxShotSec },
        }),
        schema, schemaName: "ShotList", maxTokens: 8000, effort: "medium",
        summarize: () => `Redesigned the coverage of ${sceneId} to fix: ${before.map((a) => a.code).join(", ")}`,
      }, { projectId: ctx.projectId ?? null });
      const parsed = ShotList.safeParse(clampStrings(res.output, schema));
      if (!parsed.success) throw new Error("the shots did not match the schema");
      shots = parsed.data.shots.map((s, j) => ({ ...s, index: j }));
    } catch (e) {
      revisions.push({ sceneId, before: before.map((a) => a.code), after: before.map((a) => a.code), kept: false, reason: e instanceof Error ? e.message : String(e) });
      continue;
    }
    const candidate: FilmPackage = { ...current, scenes: current.scenes.map((s, j): FilmScene => (j === i ? { ...s, shots } : s)) };
    const v = validateFilmPackage(candidate, constraints);
    const after = v.ok ? codesIn(v.pkg, sceneId) : before;
    if (!v.ok) {
      revisions.push({ sceneId, before: before.map((a) => a.code), after: before.map((a) => a.code), kept: false, reason: `invalid: ${v.issues.slice(0, 3).map((x) => x.code).join(", ")}` });
    } else if (after.length >= before.length) {
      revisions.push({ sceneId, before: before.map((a) => a.code), after: after.map((a) => a.code), kept: false, reason: "no fewer grammar problems" });
    } else {
      current = v.pkg;
      revisions.push({ sceneId, before: before.map((a) => a.code), after: after.map((a) => a.code), kept: true });
    }
  }
  return { pkg: current, revisions };
}
