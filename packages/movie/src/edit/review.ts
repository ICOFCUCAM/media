/**
 * Editorial Intelligence (DirectorOS Part 1 §21, §46). After the scenes are
 * generated the Editor reviews the film as a whole — the nine questions of
 * §21.1 — and proposes structured edit operations (§21.2–21.3). Given a plain
 * request instead ("make the opening 15 seconds faster", §46), it proposes the
 * operations that do exactly that.
 *
 * The model only proposes. Every proposal is parsed into the closed
 * EditOperation vocabulary and dry-run against the film (applyEdits): one
 * that names nothing real, or that would break canon, film grammar or a line,
 * is dropped with its reason, never shown as an option.
 */
import type { FilmPackage } from "../ir/schema";
import { PROMPTS } from "../intelligence/prompts";
import type { IntelligenceRouter } from "../intelligence/router";
import { applyEdits, describeEdit, EditOperation, EditRejected, EDIT_OPS, type ShotEffect } from "./operations";

/** The nine questions of §21.1, in order. */
export const EDITOR_QUESTIONS = [
  ["pacing", "Is the pacing correct?"],
  ["opening", "Is the opening strong?"],
  ["redundancy", "Are there redundant shots?"],
  ["escalation", "Is the emotional escalation working?"],
  ["scene_length", "Are there scenes that should be shortened?"],
  ["climax", "Does the climax arrive too early?"],
  ["ending", "Is the ending satisfying?"],
  ["transitions", "Are transitions coherent?"],
  ["dialogue", "Is dialogue repetitive?"],
] as const;
export type EditorQuestion = (typeof EDITOR_QUESTIONS)[number][0];

export interface EditorFinding {
  question: EditorQuestion;
  verdict: "works" | "needs_work";
  note: string;
}

export interface CheckedProposal {
  op: EditOperation;
  description: string;
  /** What applying it alone would do. */
  effect: { shots: ShotEffect[]; revoice: string[]; reordered: boolean; deltaSec: number; regenerate: number; recut: number; remove: number };
}

export interface EditorialReview {
  summary: string;
  findings: EditorFinding[];
  proposals: CheckedProposal[];
  /** Proposals the model made that did not survive the dry run, with why. */
  dropped: { proposal: unknown; reason: string }[];
}

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/** The film as an editor sees it: every scene and shot on the clock, every line numbered. */
export function editorialDigest(pkg: FilmPackage): Record<string, unknown> {
  let t = 0;
  return {
    title: pkg.film.title,
    logline: pkg.film.logline,
    runtimeSec: pkg.scenes.reduce((a, s) => a + s.shots.reduce((b, h) => b + h.durationSec, 0), 0),
    acts: pkg.acts.map((a) => ({ index: a.index, purpose: a.purpose, scenes: a.sceneIds })),
    setups: pkg.setups.map((s) => ({ id: s.id, plantedIn: s.plantedIn, paidOffIn: s.paidOffIn })),
    scenes: pkg.scenes.map((sc) => {
      const start = t;
      const shots = sc.shots.map((h) => {
        const at = t;
        t += h.durationSec;
        return { shot: h.index, at: fmt(at), sec: h.durationSec, size: h.size, movement: h.movement, subjects: h.subjectIds, action: h.action, transition: h.transition };
      });
      return {
        id: sc.id, act: sc.act, at: `${fmt(start)}–${fmt(t)}`, sec: t - start, heading: sc.heading, purpose: sc.purpose,
        arc: sc.emotionalArc, narration: sc.narration,
        lines: sc.dialogue.map((d, i) => ({ line: i, speaker: d.characterId, text: d.line })),
        shots,
      };
    }),
  };
}

/** The model's proposal shape: flat and nullable, so any structured-output provider accepts it. */
const FLAT = {
  type: "object",
  properties: {
    op: { type: "string", enum: [...EDIT_OPS] },
    sceneId: { type: "string" },
    shotIndex: { type: ["integer", "null"], description: "0-based shot number in the scene (CUT_SHOT, TRIM_SHOT, EXTEND_SHOT)" },
    toSec: { type: ["integer", "null"], description: "new length in seconds (TRIM_SHOT, EXTEND_SHOT, SHORTEN_SCENE)" },
    afterSceneId: { type: ["string", "null"], description: "MOVE_SCENE: the scene it now follows; null = first" },
    afterShotIndex: { type: ["integer", "null"], description: "ADD_INSERT: the shot the insert follows" },
    subjectId: { type: ["string", "null"], description: "ADD_INSERT: the char_/prop_/loc_ id it shows" },
    action: { type: ["string", "null"], description: "ADD_INSERT: what the insert shows" },
    durationSec: { type: ["integer", "null"], description: "ADD_INSERT: its length" },
    lineIndex: { type: ["integer", "null"], description: "REMOVE_LINE: 0-based line number in the scene" },
    reason: { type: "string" },
  },
  required: ["op", "sceneId", "shotIndex", "toSec", "afterSceneId", "afterShotIndex", "subjectId", "action", "durationSec", "lineIndex", "reason"],
};

export const EDITOR_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "two or three sentences on the cut as a whole" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string", enum: EDITOR_QUESTIONS.map(([k]) => k) },
          verdict: { type: "string", enum: ["works", "needs_work"] },
          note: { type: "string" },
        },
        required: ["question", "verdict", "note"],
      },
    },
    proposals: { type: "array", items: FLAT, maxItems: 12 },
  },
  required: ["summary", "findings", "proposals"],
};

/** A flat proposal → the typed operation it names (only the fields its op uses). */
export function toOperation(flat: unknown): EditOperation {
  const f = (flat ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => Object.fromEntries([["op", f.op], ["sceneId", f.sceneId], ["reason", f.reason], ...keys.map((k) => [k, f[k]])]);
  const byOp: Record<string, string[]> = {
    CUT_SHOT: ["shotIndex"], TRIM_SHOT: ["shotIndex", "toSec"], EXTEND_SHOT: ["shotIndex", "toSec"], SHORTEN_SCENE: ["toSec"],
    MOVE_SCENE: ["afterSceneId"], ADD_INSERT: ["afterShotIndex", "subjectId", "action", "durationSec"], REMOVE_LINE: ["lineIndex"],
  };
  return EditOperation.parse(pick(...(byOp[String(f.op)] ?? [])));
}

/** Dry-run one operation against the film: what it would do, or why it cannot. */
export function checkProposal(pkg: FilmPackage, op: EditOperation, maxShotSec?: number): CheckedProposal {
  const r = applyEdits(pkg, [op], { maxShotSec });
  const count = (a: ShotEffect["action"]) => r.shots.filter((s) => s.action === a).length;
  return {
    op,
    description: describeEdit(op),
    effect: {
      shots: r.shots.filter((s) => s.action !== "keep"), revoice: r.revoice, reordered: r.reordered,
      deltaSec: r.afterSec - r.beforeSec, regenerate: count("regenerate"), recut: count("recut"), remove: count("remove"),
    },
  };
}

/** Parse and dry-run what the model returned. */
export function checkReview(pkg: FilmPackage, output: unknown, maxShotSec?: number): EditorialReview {
  const o = (output ?? {}) as { summary?: unknown; findings?: unknown; proposals?: unknown };
  const known = new Set<string>(EDITOR_QUESTIONS.map(([k]) => k));
  const findings = (Array.isArray(o.findings) ? o.findings : [])
    .filter((x): x is EditorFinding => !!x && known.has((x as EditorFinding).question) && ["works", "needs_work"].includes((x as EditorFinding).verdict))
    .map((x) => ({ question: x.question, verdict: x.verdict, note: String(x.note ?? "").slice(0, 600) }));
  const proposals: CheckedProposal[] = [];
  const dropped: EditorialReview["dropped"] = [];
  for (const p of Array.isArray(o.proposals) ? o.proposals.slice(0, 12) : []) {
    try {
      proposals.push(checkProposal(pkg, toOperation(p), maxShotSec));
    } catch (e) {
      const reason = e instanceof EditRejected ? e.issues.map((i) => i.message).join("; ") : e instanceof Error ? e.message : String(e);
      dropped.push({ proposal: p, reason: reason.slice(0, 500) });
    }
  }
  return { summary: String(o.summary ?? "").slice(0, 1500), findings, proposals, dropped };
}

/**
 * Review the film (no instruction) or answer one editing request (§46). The
 * caller stores the result; nothing is applied until the owner approves.
 */
export async function reviewFilm(
  router: IntelligenceRouter,
  pkg: FilmPackage,
  opts: { instruction?: string | null; projectId?: string | null; maxShotSec?: number } = {},
): Promise<EditorialReview & { provider: string; model: string }> {
  const p = PROMPTS.editorReview;
  const instruction = opts.instruction?.trim() || null;
  const res = await router.call({
    task: "editorial", promptId: p.id, promptVersion: p.version, system: p.system,
    user: JSON.stringify({ request: instruction, film: editorialDigest(pkg) }),
    schema: EDITOR_SCHEMA, schemaName: "EditorialReview", maxTokens: 8000, effort: "high",
    summarize: (o) => {
      const r = o as { summary?: string; proposals?: unknown[] } | null;
      return `${instruction ? `Edited for "${instruction.slice(0, 100)}"` : "Reviewed the cut"}: ${r?.proposals?.length ?? 0} proposal(s). ${r?.summary ?? ""}`.slice(0, 500);
    },
  }, { projectId: opts.projectId ?? null });
  return { ...checkReview(pkg, res.output, opts.maxShotSec), provider: res.provider, model: res.model };
}
