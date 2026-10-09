/**
 * Structured edit operations (DirectorOS Part 1 §21.2–21.3, §46). The Editor
 * Agent never edits free-form: it proposes these, CineForge checks them
 * against the film, applies them to the Film IR as a pure function, validates
 * the result like any canon revision, and says exactly what each one costs —
 * which shots are only re-cut from the clip they already have, which must be
 * generated again, which disappear, which scenes are re-voiced.
 *
 *   CUT_SHOT       remove a shot                       → re-cut
 *   TRIM_SHOT      shorten a shot (keep its start)      → re-cut, no regeneration
 *   EXTEND_SHOT    lengthen a shot                      → regenerate that shot
 *   SHORTEN_SCENE  shorten a scene to a length          → trims from its last shots
 *   MOVE_SCENE     move a scene after another           → re-cut (order only)
 *   ADD_INSERT     a new insert shot after a shot       → generate the new shot
 *   REMOVE_LINE    drop a repeated/needless line        → re-voice the scene
 */
import { z } from "zod";
import { FilmPackage, type FilmPackage as Pkg, type FilmScene } from "../ir/schema";
import { speechSeconds, validateCanon, type Issue } from "../ir/validate";

export const MIN_SHOT_SEC = 2;
export const MAX_SHOT_SEC = 10;

const sceneId = z.string().regex(/^scene_\d{2,3}$/);
const reason = z.string().trim().min(1).max(300).describe("why this edit serves the film");
const sec = z.number().int().min(MIN_SHOT_SEC).max(MAX_SHOT_SEC);

export const EditOperation = z.discriminatedUnion("op", [
  z.object({ op: z.literal("CUT_SHOT"), sceneId, shotIndex: z.number().int().min(0), reason }),
  z.object({ op: z.literal("TRIM_SHOT"), sceneId, shotIndex: z.number().int().min(0), toSec: sec, reason }),
  z.object({ op: z.literal("EXTEND_SHOT"), sceneId, shotIndex: z.number().int().min(0), toSec: sec, reason }),
  z.object({ op: z.literal("SHORTEN_SCENE"), sceneId, toSec: z.number().int().min(MIN_SHOT_SEC).max(600), reason }),
  z.object({ op: z.literal("MOVE_SCENE"), sceneId, afterSceneId: sceneId.nullable().describe("the scene it now follows; null = first"), reason }),
  z.object({
    op: z.literal("ADD_INSERT"), sceneId, afterShotIndex: z.number().int().min(0),
    subjectId: z.string().regex(/^(char|prop|loc)_[a-z0-9_]+$/).describe("what the insert shows"),
    action: z.string().trim().min(1).max(300), durationSec: sec, reason,
  }),
  z.object({ op: z.literal("REMOVE_LINE"), sceneId, lineIndex: z.number().int().min(0), reason }),
]);
export type EditOperation = z.infer<typeof EditOperation>;
export const EDIT_OPS = ["CUT_SHOT", "TRIM_SHOT", "EXTEND_SHOT", "SHORTEN_SCENE", "MOVE_SCENE", "ADD_INSERT", "REMOVE_LINE"] as const;

/** How the edit reaches a shot that exists today, or a new one. */
export interface ShotEffect {
  sceneId: string;
  /** The shot's index before the edit (null = a new shot). */
  from: number | null;
  /** Its index after the edit (null = cut). */
  to: number | null;
  durationSec: number | null;
  /** recut: same clip, new length or place · regenerate: a new clip · remove: cut · keep: unchanged. */
  action: "keep" | "recut" | "regenerate" | "remove";
}

export interface EditResult {
  pkg: Pkg;
  shots: ShotEffect[];
  /** Scenes whose spoken track changes (a line was removed). */
  revoice: string[];
  /** Scenes whose order changed. */
  reordered: boolean;
  /** Film length before and after, seconds. */
  beforeSec: number;
  afterSec: number;
}

export class EditRejected extends Error {
  constructor(readonly issues: Issue[]) {
    super(`edit rejected: ${issues.map((i) => i.message).slice(0, 3).join("; ")}`);
    this.name = "EditRejected";
  }
}

const seconds = (p: Pkg) => p.scenes.reduce((a, s) => a + s.shots.reduce((b, h) => b + h.durationSec, 0), 0);
const E = (code: string, path: string, message: string): Issue => ({ stage: "production", code, path, message });

/**
 * What an edited film must still satisfy: canon (references, story, world
 * state, film grammar), shots in order and within the runtime's clip limits,
 * and every line still fits — narration and dialogue are never cut short.
 * The scene budget of the original plan does not apply: changing it is the
 * point of an edit.
 */
export function editIssues(pkg: Pkg, maxShotSec = MAX_SHOT_SEC): Issue[] {
  const parsed = FilmPackage.safeParse(pkg);
  if (!parsed.success) return parsed.error.issues.slice(0, 20).map((i) => ({ stage: "schema" as const, code: i.code.toUpperCase(), path: i.path.join("."), message: i.message }));
  const out: Issue[] = [...validateCanon(parsed.data)];
  pkg.scenes.forEach((sc, i) => {
    sc.shots.forEach((sh, j) => {
      if (sh.index !== j) out.push(E("SHOT_ORDER", `scenes[${i}].shots[${j}]`, `${sc.id} shot at ${j} has index ${sh.index}`));
      if (sh.durationSec > maxShotSec) out.push(E("SHOT_TOO_LONG", `scenes[${i}].shots[${j}]`, `${sc.id} shot ${j} runs ${sh.durationSec}s; the runtime makes at most ${maxShotSec}s`));
    });
    const total = sc.shots.reduce((a, s) => a + s.durationSec, 0);
    const speech = speechSeconds([sc.narration ?? "", ...sc.dialogue.map((d) => d.line)]);
    if (speech > total + 0.5) {
      out.push(E("SPEECH_TOO_LONG", `scenes[${i}]`, `${sc.id} needs about ${speech.toFixed(1)}s for its lines but would run ${total}s — lines are never cut, so this edit would cut them`));
    }
  });
  return out;
}

interface Track {
  from: number | null;
  durationSec: number;
  regenerate: boolean;
  recut: boolean;
}

/**
 * Apply operations in order to a copy of the film. Shot and line numbers in
 * every operation refer to the film as it was reviewed (the input), never to
 * the film as earlier operations left it — so a set of proposals approved
 * together means what each said. Throws EditRejected (with every reason) when
 * an operation names something that does not exist or was already cut, or
 * when the edited film would break canon, film grammar or its lines.
 */
export function applyEdits(input: Pkg, ops: EditOperation[], opts: { maxShotSec?: number } = {}): EditResult {
  const pkg: Pkg = structuredClone(input);
  const problems: Issue[] = [];
  const tracks = new Map<string, Track[]>(pkg.scenes.map((s) => [s.id, s.shots.map((h) => ({ from: h.index, durationSec: h.durationSec, regenerate: false, recut: false }))]));
  const lines = new Map<string, number[]>(pkg.scenes.map((s) => [s.id, s.dialogue.map((_, i) => i)]));
  const revoice = new Set<string>();
  let reordered = false;
  const scene = (id: string, path: string): FilmScene | null => {
    const s = pkg.scenes.find((x) => x.id === id) ?? null;
    if (!s) problems.push(E("UNKNOWN_SCENE", path, `there is no ${id}`));
    return s;
  };
  /** Where the reviewed film's shot `i` of a scene is now (-1: cut or never existed). */
  const shotAt = (s: FilmScene, i: number, path: string): number => {
    const at = tracks.get(s.id)!.findIndex((x) => x.from === i);
    if (at < 0) problems.push(E("UNKNOWN_SHOT", path, `${s.id} has no shot ${i + 1}${i < (input.scenes.find((x) => x.id === s.id)?.shots.length ?? 0) ? " any more (an earlier edit cut it)" : ""}`));
    return at;
  };
  const renumber = (s: FilmScene) => s.shots.forEach((h, i) => (h.index = i));

  ops.forEach((op, k) => {
    const path = `ops[${k}]`;
    const s = scene(op.sceneId, path);
    if (!s) return;
    const t = tracks.get(s.id)!;
    switch (op.op) {
      case "CUT_SHOT": {
        const at = shotAt(s, op.shotIndex, path);
        if (at < 0) return;
        if (s.shots.length === 1) return void problems.push(E("LAST_SHOT", path, `${s.id} has only one shot; a scene cannot lose its last shot`));
        s.shots.splice(at, 1);
        t.splice(at, 1);
        renumber(s);
        break;
      }
      case "TRIM_SHOT":
      case "EXTEND_SHOT": {
        const at = shotAt(s, op.shotIndex, path);
        if (at < 0) return;
        const sh = s.shots[at]!;
        const longer = op.toSec > sh.durationSec;
        if (op.op === "TRIM_SHOT" && op.toSec >= sh.durationSec) return void problems.push(E("NOT_SHORTER", path, `${s.id} shot ${op.shotIndex} already runs ${sh.durationSec}s`));
        if (op.op === "EXTEND_SHOT" && !longer) return void problems.push(E("NOT_LONGER", path, `${s.id} shot ${op.shotIndex} already runs ${sh.durationSec}s`));
        sh.durationSec = op.toSec;
        const tr = t[at]!;
        tr.durationSec = op.toSec;
        // A shorter shot is the same clip cut earlier; a longer one needs new frames.
        if (longer) tr.regenerate = true;
        else tr.recut = true;
        break;
      }
      case "SHORTEN_SCENE": {
        let total = s.shots.reduce((a, h) => a + h.durationSec, 0);
        if (op.toSec >= total) return void problems.push(E("NOT_SHORTER", path, `${s.id} already runs ${total}s`));
        // Take time from the last shots first (keep the scene's opening and set-up intact).
        for (let i = s.shots.length - 1; i >= 0 && total > op.toSec; i--) {
          const sh = s.shots[i]!;
          const take = Math.min(sh.durationSec - MIN_SHOT_SEC, total - op.toSec);
          if (take <= 0) continue;
          sh.durationSec -= take;
          total -= take;
          t[i]!.durationSec = sh.durationSec;
          t[i]!.recut = true;
        }
        if (total > op.toSec) problems.push(E("CANNOT_SHORTEN", path, `${s.id} cannot go below ${total}s by trimming (every shot is at ${MIN_SHOT_SEC}s); cut a shot instead`));
        break;
      }
      case "MOVE_SCENE": {
        const from = pkg.scenes.indexOf(s);
        const [moved] = pkg.scenes.splice(from, 1);
        let to = 0;
        if (op.afterSceneId) {
          if (op.afterSceneId === s.id) return void problems.push(E("MOVE_SELF", path, `${s.id} cannot follow itself`));
          const after = pkg.scenes.findIndex((x) => x.id === op.afterSceneId);
          if (after < 0) {
            pkg.scenes.splice(from, 0, moved!);
            return void problems.push(E("UNKNOWN_SCENE", path, `there is no ${op.afterSceneId}`));
          }
          to = after + 1;
        }
        pkg.scenes.splice(to, 0, moved!);
        // A scene belongs to the act around its new place: the act of the scene it follows.
        const prev = pkg.scenes[to - 1];
        if (prev && prev.act !== moved!.act) {
          for (const a of pkg.acts) a.sceneIds = a.sceneIds.filter((id) => id !== moved!.id);
          moved!.act = prev.act;
          pkg.acts.find((a) => a.index === prev.act)?.sceneIds.push(moved!.id);
        }
        pkg.scenes.forEach((x, i) => (x.index = i));
        for (const a of pkg.acts) a.sceneIds.sort((x, y) => pkg.scenes.findIndex((s2) => s2.id === x) - pkg.scenes.findIndex((s2) => s2.id === y));
        reordered = true;
        break;
      }
      case "ADD_INSERT": {
        const at = shotAt(s, op.afterShotIndex, path);
        if (at < 0) return;
        const after = s.shots[at]!;
        if (s.shots.length >= 12) return void problems.push(E("TOO_MANY_SHOTS", path, `${s.id} already has 12 shots`));
        s.shots.splice(at + 1, 0, {
          index: at + 1, durationSec: op.durationSec, size: "INSERT", angle: "eye", movement: "static", lens: null,
          subjectIds: [op.subjectId], action: op.action, emotion: after.emotion, lighting: after.lighting, transition: "cut",
          side: "neutral", screenDirection: null, rationale: op.reason,
        });
        t.splice(at + 1, 0, { from: null, durationSec: op.durationSec, regenerate: true, recut: false });
        renumber(s);
        break;
      }
      case "REMOVE_LINE": {
        const l = lines.get(s.id)!;
        const at = l.indexOf(op.lineIndex);
        if (at < 0) return void problems.push(E("UNKNOWN_LINE", path, `${s.id} has no line ${op.lineIndex + 1}`));
        s.dialogue.splice(at, 1);
        l.splice(at, 1);
        revoice.add(s.id);
        break;
      }
    }
  });

  if (problems.length) throw new EditRejected(problems);
  const issues = editIssues(pkg, opts.maxShotSec);
  if (issues.length) throw new EditRejected(issues);

  // Every shot that existed: kept, re-cut (new length or new place), regenerated or removed.
  const shots: ShotEffect[] = [];
  for (const original of input.scenes) {
    const t = tracks.get(original.id)!;
    const after = pkg.scenes.find((x) => x.id === original.id)!;
    const moved = reordered && after.index !== original.index;
    for (const h of original.shots) {
      const to = t.findIndex((x) => x.from === h.index);
      if (to < 0) {
        shots.push({ sceneId: original.id, from: h.index, to: null, durationSec: null, action: "remove" });
        continue;
      }
      const tr = t[to]!;
      const action = tr.regenerate ? "regenerate" : tr.recut || to !== h.index || moved ? "recut" : "keep";
      shots.push({ sceneId: original.id, from: h.index, to, durationSec: tr.durationSec, action });
    }
    t.forEach((tr, to) => {
      if (tr.from === null) shots.push({ sceneId: original.id, from: null, to, durationSec: tr.durationSec, action: "regenerate" });
    });
  }
  return { pkg, shots, revoice: [...revoice], reordered, beforeSec: seconds(input), afterSec: seconds(pkg) };
}

/** One line per operation, for people (the review panel, the decision log). */
export function describeEdit(op: EditOperation): string {
  switch (op.op) {
    case "CUT_SHOT": return `Cut ${op.sceneId} shot ${op.shotIndex + 1}`;
    case "TRIM_SHOT": return `Trim ${op.sceneId} shot ${op.shotIndex + 1} to ${op.toSec}s`;
    case "EXTEND_SHOT": return `Extend ${op.sceneId} shot ${op.shotIndex + 1} to ${op.toSec}s`;
    case "SHORTEN_SCENE": return `Shorten ${op.sceneId} to ${op.toSec}s`;
    case "MOVE_SCENE": return `Move ${op.sceneId} ${op.afterSceneId ? `after ${op.afterSceneId}` : "to the start"}`;
    case "ADD_INSERT": return `Add an insert of ${op.subjectId} after ${op.sceneId} shot ${op.afterShotIndex + 1}`;
    case "REMOVE_LINE": return `Remove line ${op.lineIndex + 1} of ${op.sceneId} (repetition)`;
  }
}
