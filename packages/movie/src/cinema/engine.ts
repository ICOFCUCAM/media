/**
 * Cinematography Engine (DirectorOS Part 1 §11, §32.5; W4).
 *
 * The Director plans every shot (size, angle, movement, lens, transition,
 * camera side, screen direction); this engine holds the plan to film grammar.
 *
 * Hard rules — a plan that breaks them is revised, then fails (stage "cinema"):
 *   CROSSES_LINE      two consecutive shots on opposite sides of the action
 *                     line (A→B) with no neutral shot between them (180°)
 *   EYELINE_MISMATCH  a reverse — consecutive singles of two different
 *                     characters from the same side — where both look the
 *                     same way on screen (they would not meet)
 *
 * Advisories — recorded and shown, never failing (visual grammar is a craft
 * judgement): no establishing shot where a new place begins, three of the
 * same size in a row, a jump from a wide to an extreme close-up, a subject's
 * screen direction flipping between consecutive shots.
 */
import type { FilmPackage, FilmShot } from "../ir/schema";
import type { Issue } from "../ir/validate";

export interface CinemaAdvisory {
  code: "NO_ESTABLISHING_SHOT" | "SIZE_REPEAT" | "SIZE_JUMP" | "SCREEN_DIRECTION_FLIP";
  sceneId: string;
  shotIndex: number;
  message: string;
}

const WIDE = new Set(["EWS", "WS"]);
const castOf = (pkg: FilmPackage) => new Set(pkg.cast.map((c) => c.id));

function single(sh: FilmShot, cast: Set<string>): string | null {
  const people = sh.subjectIds.filter((s) => cast.has(s));
  return people.length === 1 ? people[0]! : null;
}

/** Hard cinematography rules as validator issues (stage "cinema"). */
export function cinemaIssues(pkg: FilmPackage): Issue[] {
  const out: Issue[] = [];
  const cast = castOf(pkg);
  pkg.scenes.forEach((sc, i) => {
    sc.shots.forEach((sh, j) => {
      const prev = sc.shots[j - 1];
      if (!prev) return;
      const p = `scenes[${i}].shots[${j}]`;
      if (prev.side && sh.side && prev.side !== "neutral" && sh.side !== "neutral" && prev.side !== sh.side) {
        out.push({ stage: "cinema", code: "CROSSES_LINE", path: `${p}.side`,
          message: `${sc.id} cuts from side ${prev.side} to side ${sh.side} across the action line; add a neutral shot or stay on one side` });
      }
      const a = single(prev, cast);
      const b = single(sh, cast);
      if (a && b && a !== b && prev.side && prev.side === sh.side && prev.side !== "neutral"
          && prev.screenDirection && prev.screenDirection === sh.screenDirection) {
        out.push({ stage: "cinema", code: "EYELINE_MISMATCH", path: `${p}.screenDirection`,
          message: `${a} and ${b} both look ${sh.screenDirection} in a reverse; their eyelines must oppose` });
      }
    });
  });
  return out;
}

/** Visual-grammar advisories (recorded, not failing). */
export function cinemaAdvisories(pkg: FilmPackage): CinemaAdvisory[] {
  const out: CinemaAdvisory[] = [];
  const cast = castOf(pkg);
  pkg.scenes.forEach((sc, i) => {
    const newPlace = i === 0 || pkg.scenes[i - 1]!.locationId !== sc.locationId;
    const first = sc.shots[0];
    if (first && newPlace && !sc.storyTime?.continuous && !WIDE.has(first.size)) {
      out.push({ code: "NO_ESTABLISHING_SHOT", sceneId: sc.id, shotIndex: first.index,
        message: `${sc.id} opens in a new place on a ${first.size}; an establishing wide orients the audience` });
    }
    sc.shots.forEach((sh, j) => {
      const prev = sc.shots[j - 1];
      if (!prev) return;
      const prev2 = sc.shots[j - 2];
      if (prev2 && prev2.size === prev.size && prev.size === sh.size && sh.size !== "INSERT") {
        out.push({ code: "SIZE_REPEAT", sceneId: sc.id, shotIndex: sh.index, message: `three ${sh.size} shots in a row in ${sc.id}` });
      }
      if (WIDE.has(prev.size) && sh.size === "ECU" && sh.transition !== "smash_cut") {
        out.push({ code: "SIZE_JUMP", sceneId: sc.id, shotIndex: sh.index, message: `${sc.id} jumps from ${prev.size} straight to ECU` });
      }
      const a = single(prev, cast);
      if (a && a === single(sh, cast) && prev.screenDirection && sh.screenDirection && prev.screenDirection !== sh.screenDirection
          && prev.side !== "neutral" && sh.side !== "neutral") {
        out.push({ code: "SCREEN_DIRECTION_FLIP", sceneId: sc.id, shotIndex: sh.index,
          message: `${a} faces ${prev.screenDirection} then ${sh.screenDirection} on consecutive shots` });
      }
    });
  });
  return out;
}
