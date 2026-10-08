/**
 * Visual Reviewer (DirectorOS Part 2 §62 at the pixel level; W5 quality gate).
 *
 * The Continuity Engine checks the plan and the request; this checks the
 * GENERATED FRAME against the same canon — the engine's corrected generation
 * context — with a vision model through the intelligence router. Each canon
 * item gets match / mismatch / cannot_tell; only a clear mismatch on a check
 * that defines continuity counts against the shot. "cannot_tell" is never a
 * pass and never a failure: it is reported as unverified.
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { PROMPTS } from "../intelligence/prompts";
import type { IntelligenceRouter } from "../intelligence/router";
import type { RequestImage } from "../intelligence/types";
import type { GenerationContext } from "../world/continuity";

export const VisualCheck = z.enum(["presence", "identity", "wardrobe", "injuries", "location", "time", "props"]);

export const VisualReviewOutput = z.object({
  verdicts: z.array(z.object({
    check: VisualCheck,
    subjectId: z.string().describe("the canon id the verdict is about (char_*, loc_*, prop_*), or \"scene\" for time"),
    status: z.enum(["match", "mismatch", "cannot_tell"]),
    observation: z.string().max(300).describe("what is actually visible"),
  })).max(40),
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

/** The canon the frame must show, as the reviewer reads it. */
export function renderReviewRequest(ctx: GenerationContext): string {
  const lines = [
    `SHOT ${ctx.sceneId} #${ctx.shotIndex}`,
    `Location: ${ctx.location.name} (${ctx.location.id}) — ${ctx.location.description}`,
    `Time: ${ctx.clock.timeOfDay}${ctx.clock.flashback ? " (flashback)" : ""}`,
    ctx.characters.length ? "In frame:" : "In frame: no characters (nobody should be visible as a featured person).",
    ...ctx.characters.map((c) =>
      `- ${c.name} (${c.characterId})${c.age !== null ? `, age ${c.age}` : ""}: face ${c.identity.face}; hair ${c.identity.hair}; body ${c.identity.body}` +
      `${c.identity.marks.length ? `; marks ${c.identity.marks.join(", ")}` : ""}; wearing ${c.wardrobe}` +
      `${c.physical ? `; visibly ${c.physical}` : ""}${c.holding.length ? `; holding ${c.holding.map((h) => h.name).join(", ")}` : ""}`),
    ...(ctx.props.length ? ["Props in play:", ...ctx.props.map((p) => `- ${p.name} (${p.id}): ${p.description}`)] : []),
    "",
    "Give one verdict per character for presence, identity, wardrobe and (if a physical state is listed) injuries;",
    "one for the location; one for time (subjectId \"scene\"); one per prop in play.",
  ];
  return lines.join("\n");
}

export async function reviewFrame(
  router: IntelligenceRouter,
  ctx: GenerationContext,
  frames: RequestImage[],
  opts: { projectId?: string | null } = {},
): Promise<VisualReviewResult> {
  const p = PROMPTS.visualReview;
  const res = await router.call({
    task: "visual_review", promptId: p.id, promptVersion: p.version, system: p.system,
    user: renderReviewRequest(ctx), images: frames, schema: schema(), schemaName: "VisualReview",
    maxTokens: 2000, effort: "medium",
  }, { projectId: opts.projectId ?? null });
  return judgeReview(VisualReviewOutput.parse(res.output), res.provider, res.model);
}

/** Turn the reviewer's verdicts into a result (pure; exported for tests). */
export function judgeReview(out: VisualReviewOutput, provider: string, model: string): VisualReviewResult {
  const findings = out.verdicts.map((v) => ({ ...v, blocking: v.status === "mismatch" && DEFINING.has(v.check) }));
  return {
    passed: !findings.some((f) => f.blocking),
    findings,
    unverified: findings.filter((f) => f.status === "cannot_tell").length,
    provider,
    model,
  };
}
