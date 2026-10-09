/**
 * Film IR validator chain (DirectorOS DOS-24, DOS-94; Part 2 §94 "proposed →
 * validated → executed").
 *
 * The planning model PROPOSES a Film Production Package; nothing is executed
 * until it passes every stage:
 *
 *   schema      — shape, types, ids, lengths (zod)
 *   references  — every id points at something defined in the package
 *   story       — scene order, acts, threads, setups planted before payoff
 *   canon       — the world holds together (W3): story time only runs backwards
 *                 in flashbacks, continuous action keeps clothes and injuries,
 *                 one holder per prop, the dead stay dead (outside flashbacks),
 *                 nobody says what they cannot know,
 *                 setups are established before they pay off, mysteries are
 *                 answered for the audience
 *   cinema      — film grammar the plan must keep: no jump across the
 *                 180° line, reverses whose eyelines meet (W4)
 *   production  — scene count, shots per scene, shot length vs the runtime's
 *                 per-clip maximum, scene length on the plan
 *   budget      — the film's total runtime matches what was paid for
 *
 * Failures are returned as structured issues (stage, code, path, message) so a
 * single SURGICAL revision call can fix exactly them (Part 2 §93) — invalid
 * output is never padded with invented defaults (DOS-74).
 */
import { AUDIENCE, FilmPackage } from "./schema";
import { applyReveals, clockFitsTimeOfDay, clockMinutes, initialKnowledge, timeOfDayRank } from "../world/state";
import { checkFilmContinuity } from "../world/continuity";
import { cinemaIssues } from "../cinema/engine";

export type IssueStage = "schema" | "references" | "story" | "canon" | "cinema" | "production" | "budget";

export interface Issue {
  stage: IssueStage;
  code: string;
  path: string;
  message: string;
}

export interface ProductionConstraints {
  /** Scenes the plan must have (the cost estimate was made for this many). */
  sceneCount: number;
  /** Target length of one scene, seconds. */
  sceneSec: number;
  /** Allowed deviation of a scene's shot total from sceneSec (fraction). */
  sceneTolerance: number;
  /** Most shots one scene may have (keeps GPU spend inside the estimate). */
  maxShotsPerScene: number;
  /** The video runtime's per-clip maximum, seconds. */
  maxShotSec: number;
  /** The film length that was requested and estimated, seconds. */
  targetSeconds: number;
  /** Allowed deviation of the film total from targetSeconds (fraction). */
  filmTolerance: number;
  /** Series (W11): exactly this many episodes, one act each. */
  episodes?: number;
  /** Narrated formats (story): every scene carries narration. */
  narrated?: boolean;
  /** Animation (W12): every character has a design (proportions, palette, movement). */
  animation?: boolean;
  /** Characters cast before planning (Character Cards, earlier episodes): each must be in the film, unrenamed. */
  cast?: { id: string; name: string }[];
  /** Characters who died in earlier episodes: they appear only in flashbacks. */
  deceased?: { id: string; name: string }[];
}

export type ValidationResult = { ok: true; pkg: FilmPackage; issues: [] } | { ok: false; issues: Issue[]; pkg?: FilmPackage };

export function validateFilmPackage(raw: unknown, c: ProductionConstraints): ValidationResult {
  const parsed = FilmPackage.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.slice(0, 40).map((i) => ({
        stage: "schema" as const,
        code: i.code.toUpperCase(),
        path: i.path.join("."),
        message: i.message,
      })),
    };
  }
  const pkg = parsed.data;
  const issues: Issue[] = [...validateCanon(pkg), ...production(pkg, c), ...budget(pkg, c)];
  return issues.length ? { ok: false, issues, pkg } : { ok: true, pkg, issues: [] };
}

/**
 * The stages that do not depend on what was paid for (references, story,
 * canon) — what a canon revision must still satisfy.
 */
export function validateCanon(pkg: FilmPackage): Issue[] {
  const refs = references(pkg);
  // Canon checks walk the world state, which assumes every id resolves.
  return [...refs, ...story(pkg), ...(refs.length ? [] : [...canon(pkg), ...cinemaIssues(pkg)])];
}

function dupes<T>(items: T[], key: (t: T) => string, stage: IssueStage, path: string): Issue[] {
  const seen = new Set<string>();
  const out: Issue[] = [];
  items.forEach((t, i) => {
    const k = key(t);
    if (seen.has(k)) out.push({ stage, code: "DUPLICATE_ID", path: `${path}[${i}]`, message: `id ${k} is defined twice` });
    seen.add(k);
  });
  return out;
}

function references(pkg: FilmPackage): Issue[] {
  const out: Issue[] = [];
  const R = (path: string, message: string) => out.push({ stage: "references", code: "UNKNOWN_REFERENCE", path, message });
  out.push(...dupes(pkg.cast, (x) => x.id, "references", "cast"));
  out.push(...dupes(pkg.locations, (x) => x.id, "references", "locations"));
  out.push(...dupes(pkg.props, (x) => x.id, "references", "props"));
  out.push(...dupes(pkg.scenes, (x) => x.id, "references", "scenes"));
  out.push(...dupes(pkg.threads, (x) => x.id, "references", "threads"));
  out.push(...dupes(pkg.setups, (x) => x.id, "references", "setups"));
  out.push(...dupes(pkg.facts, (x) => x.id, "references", "facts"));
  out.push(...dupes(pkg.relationships, (x) => x.id, "references", "relationships"));

  const chars = new Map(pkg.cast.map((c) => [c.id, c]));
  const locs = new Set(pkg.locations.map((l) => l.id));
  const props = new Set(pkg.props.map((p) => p.id));
  const scenes = new Set(pkg.scenes.map((s) => s.id));
  const facts = new Set(pkg.facts.map((f) => f.id));
  const knower = (w: string) => w === AUDIENCE || chars.has(w);
  const fact = (f: string, path: string) => !facts.has(f) && R(path, `fact ${f} does not exist`);

  const relIds = new Set(pkg.relationships.map((r) => r.id));
  pkg.relationships.forEach((r, i) => {
    if (!chars.has(r.a)) R(`relationships[${i}].a`, `${r.a} is not in the cast`);
    if (!chars.has(r.b)) R(`relationships[${i}].b`, `${r.b} is not in the cast`);
    if (r.a === r.b) out.push({ stage: "references", code: "RELATIONSHIP_WITH_SELF", path: `relationships[${i}]`, message: `${r.id} relates ${r.a} to themself` });
  });
  pkg.facts.forEach((f, i) => f.knownAtStart.forEach((w, j) => !knower(w) && R(`facts[${i}].knownAtStart[${j}]`, `${w} is not in the cast`)));
  pkg.threads.forEach((t, i) => t.answerFactId && fact(t.answerFactId, `threads[${i}].answerFactId`));
  pkg.setups.forEach((s, i) => {
    if (s.factId) fact(s.factId, `setups[${i}].factId`);
    s.developedIn.forEach((d, j) => !scenes.has(d) && R(`setups[${i}].developedIn[${j}]`, `scene ${d} does not exist`));
  });

  pkg.props.forEach((p, i) => {
    if (p.ownerId && !chars.has(p.ownerId)) R(`props[${i}].ownerId`, `owner ${p.ownerId} is not in the cast`);
  });
  pkg.acts.forEach((a, i) => a.sceneIds.forEach((s, j) => !scenes.has(s) && R(`acts[${i}].sceneIds[${j}]`, `scene ${s} does not exist`)));
  pkg.threads.forEach((t, i) => t.sceneIds.forEach((s, j) => !scenes.has(s) && R(`threads[${i}].sceneIds[${j}]`, `scene ${s} does not exist`)));
  pkg.setups.forEach((s, i) => {
    if (!scenes.has(s.plantedIn)) R(`setups[${i}].plantedIn`, `scene ${s.plantedIn} does not exist`);
    if (!scenes.has(s.paidOffIn)) R(`setups[${i}].paidOffIn`, `scene ${s.paidOffIn} does not exist`);
  });
  pkg.scenes.forEach((sc, i) => {
    const p = `scenes[${i}]`;
    if (!locs.has(sc.locationId)) R(`${p}.locationId`, `location ${sc.locationId} does not exist`);
    const present = new Set<string>();
    sc.characters.forEach((st, j) => {
      const ch = chars.get(st.characterId);
      present.add(st.characterId);
      if (!ch) return R(`${p}.characters[${j}].characterId`, `character ${st.characterId} is not in the cast`);
      if (!ch.wardrobe.some((w) => w.id === st.wardrobeId)) {
        R(`${p}.characters[${j}].wardrobeId`, `${st.wardrobeId} is not one of ${ch.name}'s wardrobe entries`);
      }
      st.holding.forEach((h, k) => !props.has(h) && R(`${p}.characters[${j}].holding[${k}]`, `prop ${h} does not exist`));
    });
    sc.reveals.forEach((r, j) => {
      fact(r.factId, `${p}.reveals[${j}].factId`);
      r.to.forEach((w, k) => {
        if (!knower(w)) R(`${p}.reveals[${j}].to[${k}]`, `${w} is not in the cast`);
        else if (w !== AUDIENCE && !present.has(w)) {
          out.push({ stage: "references", code: "REVEAL_TO_ABSENT", path: `${p}.reveals[${j}].to[${k}]`,
            message: `${w} learns ${r.factId} here but is not in the scene` });
        }
      });
    });
    sc.deaths.forEach((d, j) => {
      if (!chars.has(d)) R(`${p}.deaths[${j}]`, `${d} is not in the cast`);
      else if (!present.has(d)) {
        out.push({ stage: "references", code: "DEATH_OF_ABSENT", path: `${p}.deaths[${j}]`, message: `${d} dies in ${sc.id} but is not in the scene` });
      }
    });
    sc.relationshipChanges.forEach((c, j) => {
      if (!relIds.has(c.relationshipId)) return R(`${p}.relationshipChanges[${j}].relationshipId`, `relationship ${c.relationshipId} does not exist`);
      const r = pkg.relationships.find((x) => x.id === c.relationshipId)!;
      if (!present.has(r.a) && !present.has(r.b)) {
        out.push({ stage: "references", code: "RELATIONSHIP_CHANGE_OFFSCREEN", path: `${p}.relationshipChanges[${j}]`,
          message: `${c.relationshipId} changes in ${sc.id} but neither ${r.a} nor ${r.b} is in the scene` });
      }
    });
    sc.dialogue.forEach((d, j) => {
      d.references.forEach((f, k) => fact(f, `${p}.dialogue[${j}].references[${k}]`));
      if (!chars.has(d.characterId)) R(`${p}.dialogue[${j}].characterId`, `character ${d.characterId} is not in the cast`);
      else if (!present.has(d.characterId)) {
        out.push({ stage: "references", code: "SPEAKER_NOT_PRESENT", path: `${p}.dialogue[${j}].characterId`,
          message: `${d.characterId} speaks but is not listed in the scene's characters` });
      }
    });
    sc.shots.forEach((sh, j) =>
      sh.subjectIds.forEach((s, k) => {
        if (!chars.has(s) && !props.has(s) && !locs.has(s)) R(`${p}.shots[${j}].subjectIds[${k}]`, `subject ${s} does not exist`);
      }),
    );
  });
  return out;
}

function story(pkg: FilmPackage): Issue[] {
  const out: Issue[] = [];
  const S = (code: string, path: string, message: string) => out.push({ stage: "story", code, path, message });
  pkg.scenes.forEach((sc, i) => sc.index !== i && S("SCENE_ORDER", `scenes[${i}].index`, `scene at position ${i} has index ${sc.index}`));
  if (!pkg.cast.some((c) => c.role === "protagonist")) S("NO_PROTAGONIST", "cast", "the cast has no protagonist");

  const order = new Map(pkg.scenes.map((s) => [s.id, s.index]));
  const actOf = new Map<string, number>();
  pkg.acts.forEach((a, i) => {
    if (a.index !== i + 1) S("ACT_ORDER", `acts[${i}].index`, `act at position ${i} has index ${a.index}`);
    a.sceneIds.forEach((s) => {
      if (actOf.has(s)) S("SCENE_IN_TWO_ACTS", `acts[${i}]`, `${s} is in more than one act`);
      actOf.set(s, a.index);
    });
  });
  pkg.scenes.forEach((sc, i) => {
    const a = actOf.get(sc.id);
    if (a === undefined) S("SCENE_WITHOUT_ACT", `scenes[${i}]`, `${sc.id} is in no act`);
    else if (a !== sc.act) S("ACT_MISMATCH", `scenes[${i}].act`, `${sc.id} says act ${sc.act} but act ${a} lists it`);
  });
  let lastAct = 0;
  pkg.scenes.forEach((sc, i) => {
    if (sc.act < lastAct) S("ACT_REGRESSION", `scenes[${i}].act`, `${sc.id} returns to act ${sc.act} after act ${lastAct}`);
    lastAct = Math.max(lastAct, sc.act);
  });
  pkg.setups.forEach((s, i) => {
    const a = order.get(s.plantedIn);
    const b = order.get(s.paidOffIn);
    if (a !== undefined && b !== undefined && b <= a) {
      S("PAYOFF_BEFORE_SETUP", `setups[${i}]`, `${s.id} is paid off in ${s.paidOffIn}, not after it is planted in ${s.plantedIn}`);
    }
  });
  return out;
}

function canon(pkg: FilmPackage): Issue[] {
  const out: Issue[] = [];
  const C = (code: string, path: string, message: string) => out.push({ stage: "canon", code, path, message });
  const order = new Map(pkg.scenes.map((s) => [s.id, s.index]));

  // Story time (Part 1 §33): forward, except in flashbacks; continuous action
  // stays on the same day and never goes back in the day.
  // The story clock (W20; §33.1): it agrees with the time of day, never runs
  // backwards within a day, and continuous action picks up within the hour.
  let last: { day: number; tod: number; min: number | null; id: string } | null = null;
  pkg.scenes.forEach((sc, i) => {
    const t = sc.storyTime;
    if (!t) return;
    const p = `scenes[${i}].storyTime`;
    const min = t.clock ? clockMinutes(t.clock) : null;
    if (t.clock && !clockFitsTimeOfDay(t.clock, sc.timeOfDay)) {
      C("CLOCK_OUTSIDE_TIME_OF_DAY", `${p}.clock`, `${sc.id} is set at ${t.clock}, which is not ${sc.timeOfDay}`);
    }
    if (t.continuous) {
      const prev = pkg.scenes[i - 1];
      if (!prev) C("CONTINUOUS_FIRST_SCENE", p, `${sc.id} is the first scene; it cannot continue a previous one`);
      else if (prev.storyTime && (prev.storyTime.day !== t.day || timeOfDayRank(sc.timeOfDay) < timeOfDayRank(prev.timeOfDay))) {
        C("CONTINUOUS_TIME_JUMP", p, `${sc.id} continues ${prev.id} but is set at a different time`);
      } else if (prev.storyTime?.clock && min !== null) {
        const gap = min - clockMinutes(prev.storyTime.clock);
        if (gap < 0 || gap > 60) C("CONTINUOUS_TIME_JUMP", `${p}.clock`, `${sc.id} continues ${prev.id} (${prev.storyTime.clock}) but is set at ${t.clock}`);
      }
      // Continuous action keeps its weather (W20; §33.2).
      if (prev?.weather && sc.weather && prev.weather.trim().toLowerCase() !== sc.weather.trim().toLowerCase()) {
        C("WEATHER_CHANGE_IN_CONTINUOUS_ACTION", `scenes[${i}].weather`, `${sc.id} continues ${prev.id} but its weather changes from "${prev.weather}" to "${sc.weather}"`);
      }
    }
    if (t.flashback) return;
    const tod = timeOfDayRank(sc.timeOfDay);
    if (last && (t.day < last.day || (t.day === last.day && tod < last.tod)
      || (t.day === last.day && min !== null && last.min !== null && min < last.min))) {
      C("TIME_REGRESSION", p, `${sc.id} is set before ${last.id} (day ${t.day} ${t.clock ?? sc.timeOfDay}) but is not marked as a flashback`);
    }
    last = { day: t.day, tod, min: min ?? (last && last.day === t.day ? last.min : null), id: sc.id };
  });

  pkg.scenes.forEach((sc, i) => {
    const p = `scenes[${i}]`;
    // One holder per prop.
    const holder = new Map<string, string>();
    sc.characters.forEach((st, j) => st.holding.forEach((h, k) => {
      const other = holder.get(h);
      if (other) C("PROP_TWO_HOLDERS", `${p}.characters[${j}].holding[${k}]`, `${h} is held by both ${other} and ${st.characterId}`);
      holder.set(h, st.characterId);
    }));
    // Continuous action: same clothes, injuries do not vanish.
    const prev = pkg.scenes[i - 1];
    if (!sc.storyTime?.continuous || !prev) return;
    sc.characters.forEach((st, j) => {
      const before = prev.characters.find((x) => x.characterId === st.characterId);
      if (!before) return;
      if (before.wardrobeId !== st.wardrobeId) {
        C("WARDROBE_CHANGE_IN_CONTINUOUS_ACTION", `${p}.characters[${j}].wardrobeId`,
          `${st.characterId} wears ${st.wardrobeId} but wore ${before.wardrobeId} in ${prev.id}, which this scene continues`);
      }
      if (before.physical && !st.physical) {
        C("PHYSICAL_STATE_DROPPED", `${p}.characters[${j}].physical`,
          `${st.characterId} was "${before.physical}" in ${prev.id}, which this scene continues; it cannot vanish`);
      }
    });
  });

  // Dead stays dead (Part 1 §32.4): after dying, a character appears only in flashbacks.
  const deadSince = new Map<string, string>();
  pkg.scenes.forEach((sc, i) => {
    const flashback = sc.storyTime?.flashback ?? false;
    if (!flashback) {
      sc.characters.forEach((st, j) => {
        const d = deadSince.get(st.characterId);
        if (d) C("DEAD_CHARACTER_APPEARS", `scenes[${i}].characters[${j}]`, `${st.characterId} died in ${d} but appears in ${sc.id}, which is not a flashback`);
      });
    }
    sc.deaths.forEach((d, j) => {
      if (flashback) C("DEATH_IN_FLASHBACK", `scenes[${i}].deaths[${j}]`, `${d} dies in a flashback; record deaths in present-time scenes`);
      else if (deadSince.has(d)) C("DIES_TWICE", `scenes[${i}].deaths[${j}]`, `${d} already died in ${deadSince.get(d)}`);
      else deadSince.set(d, sc.id);
    });
  });

  // Knowledge (Part 1 §56): a line may only rely on what its speaker knows by then.
  const k = initialKnowledge(pkg);
  const audienceBy = new Map<string, Set<string>>();
  pkg.scenes.forEach((sc, i) => {
    applyReveals(k, sc);
    audienceBy.set(sc.id, new Set(k.get(AUDIENCE)));
    sc.dialogue.forEach((d, j) => d.references.forEach((f, r) => {
      if (!k.get(d.characterId)?.has(f)) {
        C("KNOWLEDGE_VIOLATION", `scenes[${i}].dialogue[${j}].references[${r}]`,
          `${d.characterId} relies on ${f} but has not learned it by ${sc.id}`);
      }
    }));
  });

  // Foreshadowing (Part 1 §58): plant → development → payoff, established for the audience.
  pkg.setups.forEach((s, i) => {
    const a = order.get(s.plantedIn)!;
    const b = order.get(s.paidOffIn)!;
    s.developedIn.forEach((d, j) => {
      const x = order.get(d)!;
      if (x <= a || x >= b) C("DEVELOPMENT_OUT_OF_ORDER", `setups[${i}].developedIn[${j}]`, `${d} is not between the plant (${s.plantedIn}) and the payoff (${s.paidOffIn})`);
    });
    if (s.factId && !audienceBy.get(s.plantedIn)?.has(s.factId)) {
      C("SETUP_NOT_ESTABLISHED", `setups[${i}].factId`, `${s.id} pays off ${s.factId}, but the audience has not been shown it by ${s.plantedIn}`);
    }
  });
  // Mystery (Part 1 §57): the answer is withheld at first and reaches the audience inside the thread.
  const audienceAtStart = initialKnowledge(pkg).get(AUDIENCE)!;
  pkg.threads.forEach((t, i) => {
    if (t.kind !== "mystery" || !t.answerFactId) return;
    if (audienceAtStart.has(t.answerFactId)) {
      C("MYSTERY_SPOILED", `threads[${i}].answerFactId`, `the audience knows ${t.answerFactId} before the film starts`);
      return;
    }
    const lastScene = t.sceneIds.reduce((m, s) => ((order.get(s) ?? -1) > (order.get(m) ?? -1) ? s : m), t.sceneIds[0]!);
    if (!audienceBy.get(lastScene)?.has(t.answerFactId)) {
      C("MYSTERY_UNRESOLVED", `threads[${i}]`, `${t.id} never reveals ${t.answerFactId} to the audience by ${lastScene}`);
    }
  });
  if (out.length) return out;

  // Every planned shot against the world state (Part 2 §62): who and what is in frame must be there.
  const at = new Map(pkg.scenes.map((s, i) => [s.id, i]));
  for (const { sceneId, shotIndex, result } of checkFilmContinuity(pkg)) {
    const i = at.get(sceneId)!;
    const j = pkg.scenes[i]!.shots.findIndex((s) => s.index === shotIndex);
    for (const v of result.violations) {
      if (v.code === "CHARACTER_NOT_IN_SCENE") C("FRAMED_NOT_PRESENT", `scenes[${i}].shots[${j}].subjectIds`, `${v.subjectId} is framed but not listed in ${sceneId}'s characters`);
      if (v.code === "PROP_ELSEWHERE") C("PROP_ELSEWHERE", `scenes[${i}].shots[${j}].subjectIds`, v.message);
    }
  }
  return out;
}

/** Words spoken per second at a natural film pace, and the pause between spoken parts. */
export const SPEECH_WPS = 2.6;
export const SPEECH_GAP_SEC = 0.35;

/** Estimated seconds to speak these parts (empty parts are skipped). */
export function speechSeconds(parts: string[]): number {
  const spoken = parts.map((t) => t.trim()).filter(Boolean);
  if (!spoken.length) return 0;
  const words = spoken.reduce((n, t) => n + t.split(/\s+/).length, 0);
  return words / SPEECH_WPS + SPEECH_GAP_SEC * (spoken.length - 1);
}

function production(pkg: FilmPackage, c: ProductionConstraints): Issue[] {
  const out: Issue[] = [];
  const P = (code: string, path: string, message: string) => out.push({ stage: "production", code, path, message });
  if (pkg.scenes.length !== c.sceneCount) P("SCENE_COUNT", "scenes", `the plan has ${pkg.scenes.length} scenes; ${c.sceneCount} are required`);
  if (c.episodes && pkg.acts.length !== c.episodes) {
    P("EPISODE_COUNT", "acts", `a series of ${c.episodes} episodes needs ${c.episodes} acts (one per episode); the plan has ${pkg.acts.length}`);
  }
  if (c.narrated) {
    pkg.scenes.forEach((sc, i) => !sc.narration?.trim() && P("NARRATION_MISSING", `scenes[${i}].narration`, `${sc.id} has no narration; this format is told by a narrator`));
  }
  if (c.animation) {
    pkg.cast.forEach((ch, i) => !ch.design && P("DESIGN_MISSING", `cast[${i}].design`, `${ch.id} has no design; animated characters need proportions, colours and movement`));
  }
  for (const want of c.cast ?? []) {
    const ch = pkg.cast.find((x) => x.id === want.id);
    if (!ch) P("CAST_MISSING", "cast", `${want.id} ("${want.name}") was cast for this production but is not in the package`);
    else if (ch.name.trim().toLowerCase() !== want.name.trim().toLowerCase()) P("CAST_RENAMED", `cast[${pkg.cast.indexOf(ch)}].name`, `${want.id} is "${want.name}", not "${ch.name}"`);
    else if (!pkg.scenes.some((sc) => sc.characters.some((st) => st.characterId === want.id))) {
      P("CAST_UNUSED", "scenes", `${want.id} ("${want.name}") was cast for this production but appears in no scene`);
    }
  }
  for (const dead of c.deceased ?? []) {
    pkg.scenes.forEach((sc, i) => {
      if (sc.characters.some((st) => st.characterId === dead.id) && !sc.storyTime?.flashback) {
        P("DECEASED_APPEARS", `scenes[${i}].characters`, `${dead.name} died in an earlier episode; ${sc.id} may show them only as a flashback`);
      }
    });
  }
  pkg.scenes.forEach((sc, i) => {
    const p = `scenes[${i}]`;
    if (sc.shots.length > c.maxShotsPerScene) P("TOO_MANY_SHOTS", `${p}.shots`, `${sc.shots.length} shots; at most ${c.maxShotsPerScene}`);
    sc.shots.forEach((sh, j) => {
      if (sh.index !== j) P("SHOT_ORDER", `${p}.shots[${j}].index`, `shot at position ${j} has index ${sh.index}`);
      if (sh.durationSec > c.maxShotSec) P("SHOT_TOO_LONG", `${p}.shots[${j}].durationSec`, `${sh.durationSec}s exceeds the ${c.maxShotSec}s per-clip maximum`);
    });
    const total = sc.shots.reduce((a, s) => a + s.durationSec, 0);
    // Narration and dialogue are spoken in full and never cut (docs/38 §AW.2):
    // a scene must be long enough to hold them, or the render fails.
    const speech = speechSeconds([sc.narration ?? "", ...sc.dialogue.map((d) => d.line)]);
    if (speech > total + 0.5) {
      P("SPEECH_TOO_LONG", `${p}.dialogue`, `narration and dialogue need about ${speech.toFixed(1)}s spoken; the scene's shots run ${total}s — shorten the lines or lengthen the scene`);
    }
    if (Math.abs(total - c.sceneSec) > c.sceneSec * c.sceneTolerance) {
      P("SCENE_LENGTH", `${p}.shots`, `shots total ${total}s; the scene should run ${c.sceneSec}s (±${Math.round(c.sceneTolerance * 100)}%)`);
    }
  });
  return out;
}

function budget(pkg: FilmPackage, c: ProductionConstraints): Issue[] {
  const total = pkg.scenes.reduce((a, sc) => a + sc.shots.reduce((b, s) => b + s.durationSec, 0), 0);
  if (Math.abs(total - c.targetSeconds) > c.targetSeconds * c.filmTolerance) {
    return [{ stage: "budget", code: "FILM_LENGTH", path: "scenes",
      message: `the film totals ${total}s; ${c.targetSeconds}s was requested (±${Math.round(c.filmTolerance * 100)}%)` }];
  }
  return [];
}

/** Total planned runtime of a package, seconds. */
export function packageSeconds(pkg: FilmPackage): number {
  return pkg.scenes.reduce((a, sc) => a + sc.shots.reduce((b, s) => b + s.durationSec, 0), 0);
}

/** Issues rendered for a revision prompt: one per line, stage-tagged. */
export function formatIssues(issues: Issue[]): string {
  return issues.map((i) => `- [${i.stage}/${i.code}] ${i.path}: ${i.message}`).join("\n");
}
