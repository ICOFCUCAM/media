/**
 * Visual Reviewer (DirectorOS Part 2 §62 at the pixel level; W5 quality gate).
 *
 * The Continuity Engine checks the plan and the request; this checks the
 * GENERATED FRAME against the same canon — the engine's corrected generation
 * context — with a vision model through the intelligence router. Each canon
 * item gets match / mismatch / cannot_tell; only a clear mismatch on a check
 * that defines continuity counts against the shot. "cannot_tell" is never a
 * pass and never a failure: it is reported as unverified.
 *
 * v2 (W18; Part 1 §16–17): a clip is reviewed on its start, middle and end
 * frames; generation defects (hands, objects) and the planned camera movement
 * are checked (and, advisory, whether a readable face shows the stated
 * feeling); and the shot gets five 0–100 scores (identity, composition,
 * continuity, lighting, prompt adherence). Defects, camera and scores are
 * advisory: only the defining canon checks can block a shot.
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { PROMPTS } from "../intelligence/prompts";
import type { IntelligenceRouter } from "../intelligence/router";
import type { RequestImage } from "../intelligence/types";
import type { GenerationContext } from "../world/continuity";

export const VisualCheck = z.enum(["presence", "identity", "wardrobe", "injuries", "location", "time", "props", "emotion", "hands", "objects", "camera"]);

const score = z.number().int().min(0).max(100).nullable();
export const VisualScores = z.object({
  identity: score.describe("faces and bodies match canon and stay stable; null with nobody in frame"),
  composition: score.describe("framing, balance, a readable subject"),
  continuity: score.describe("wardrobe, props, place and time agree with canon and across the frames"),
  lighting: score.describe("coherent and right for the time and location"),
  promptAdherence: score.describe("shows what the shot prompt asks for"),
});
export type VisualScores = z.infer<typeof VisualScores>;
export const SCORE_DIMENSIONS = ["identity", "composition", "continuity", "lighting", "promptAdherence"] as const;

export const VisualReviewOutput = z.object({
  verdicts: z.array(z.object({
    check: VisualCheck,
    subjectId: z.string().describe("the canon id the verdict is about (char_*, loc_*, prop_*), \"scene\" for time or scene-wide defects, \"shot\" for camera"),
    status: z.enum(["match", "mismatch", "cannot_tell"]),
    observation: z.string().max(300).describe("what is actually visible"),
  })).max(40),
  scores: VisualScores.optional(),
});
export type VisualReviewOutput = z.infer<typeof VisualReviewOutput>;

/** Checks whose clear mismatch means the shot contradicts canon. */
const DEFINING = new Set(["presence", "identity", "wardrobe", "injuries", "location"]);

export interface VisualFinding {
  check: z.infer<typeof VisualCheck>;
  subjectId: string;
  status: "match" | "mismatch" | "cannot_tell";
  observation: string;
  blocking: boolean;
}

export interface VisualReviewResult {
  /** False iff a defining check clearly mismatches. */
  passed: boolean;
  findings: VisualFinding[];
  /** Canon items the reviewer could not verify. */
  unverified: number;
  /** Per-dimension 0–100 scores (W18); null when the reviewer gave none. */
  scores: VisualScores | null;
  provider: string;
  model: string;
}

let schemaCache: Record<string, unknown> | null = null;
function schema(): Record<string, unknown> {
  if (schemaCache) return schemaCache;
  const s = zodToJsonSchema(VisualReviewOutput, { target: "jsonSchema7", $refStrategy: "none" }) as Record<string, unknown>;
  delete s.$schema;
  return (schemaCache = s);
}

/** What the reviewer is looking at, beyond canon (W18). */
export interface ReviewMedia {
  /** A clip's frames are in time order (start, middle, end); a still is one frame. */
  kind: "clip" | "still";
  /** The planned camera movement of the shot, if any. */
  cameraMovement?: string | null;
  cameraType?: string | null;
}

/** The canon the frames must show, as the reviewer reads it. */
export function renderReviewRequest(ctx: GenerationContext, media: ReviewMedia = { kind: "still" }): string {
  const clip = media.kind === "clip";
  const lines = [
    `SHOT ${ctx.sceneId} #${ctx.shotIndex}`,
    clip ? "Frames: start, middle and end of the generated clip, in order." : "Frame: one generated still.",
    `Shot prompt: ${ctx.prompt}`,
    `Location: ${ctx.location.name} (${ctx.location.id}) — ${ctx.location.description}`,
    `Time: ${ctx.clock.timeOfDay}${ctx.clock.flashback ? " (flashback)" : ""}`,
    ctx.characters.length ? "In frame:" : "In frame: no characters (nobody should be visible as a featured person).",
    ...ctx.characters.map((c) =>
      `- ${c.name} (${c.characterId})${c.age !== null ? `, age ${c.age}` : ""}: face ${c.identity.face}; hair ${c.identity.hair}; body ${c.identity.body}` +
      `${c.identity.marks.length ? `; marks ${c.identity.marks.join(", ")}` : ""}; wearing ${c.wardrobe}` +
      `${c.physical ? `; visibly ${c.physical}` : ""}${c.emotion ? `; feeling ${c.emotion}` : ""}${c.holding.length ? `; holding ${c.holding.map((h) => h.name).join(", ")}` : ""}`),
    ...(ctx.props.length ? ["Props in play:", ...ctx.props.map((p) => `- ${p.name} (${p.id}): ${p.description}`)] : []),
    "",
    "Give one verdict per character for presence, identity, wardrobe and (if a physical state is listed) injuries;",
    "one for the location; one for time (subjectId \"scene\"); one per prop in play;",
    "one emotion verdict per character whose face is readable (does the expression fit?);",
    "hands and objects verdicts for any defect you see; then the five scores.",
    ...(clip ? [`Planned camera: ${[media.cameraType, media.cameraMovement].filter(Boolean).join(", ") || "not specified (judge only that the view is stable and intentional)"} — give one camera verdict (subjectId "shot").`] : []),
  ];
  return lines.join("\n");
}

export async function reviewFrame(
  router: IntelligenceRouter,
  ctx: GenerationContext,
  frames: RequestImage[],
  opts: { projectId?: string | null; media?: ReviewMedia } = {},
): Promise<VisualReviewResult> {
  const p = PROMPTS.visualReview;
  const res = await router.call({
    task: "visual_review", promptId: p.id, promptVersion: p.version, system: p.system,
    user: renderReviewRequest(ctx, opts.media ?? { kind: frames.length > 1 ? "clip" : "still" }), images: frames, schema: schema(), schemaName: "VisualReview",
    maxTokens: 2000, effort: "medium",
    summarize: (o) => {
      const v = (o as { verdicts?: { check: string; status: string }[] } | null)?.verdicts ?? [];
      const bad = v.filter((x) => x.status === "mismatch").map((x) => x.check);
      return `Reviewed ${v.length} checks on ${frames.length} frame${frames.length === 1 ? "" : "s"}: ${bad.length ? `flags ${bad.join(", ")}` : "no contradiction found"}.`;
    },
  }, { projectId: opts.projectId ?? null });
  return judgeReview(VisualReviewOutput.parse(res.output), res.provider, res.model);
}

/** Mean of the scores the reviewer could give, 0–1 (null when none). */
export function meanScore(scores: VisualScores | null): number | null {
  const v = scores ? SCORE_DIMENSIONS.map((d) => scores[d]).filter((x): x is number => x !== null) : [];
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length / 100 : null;
}

/** Turn the reviewer's verdicts into a result (pure; exported for tests). */
export function judgeReview(out: VisualReviewOutput, provider: string, model: string): VisualReviewResult {
  const findings = out.verdicts.map((v) => ({ ...v, blocking: v.status === "mismatch" && DEFINING.has(v.check) }));
  return {
    passed: !findings.some((f) => f.blocking),
    findings,
    unverified: findings.filter((f) => f.status === "cannot_tell").length,
    scores: out.scores ?? null,
    provider,
    model,
  };
}
