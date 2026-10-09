/**
 * Visual quality gate for generated shots (DirectorOS W5; Part 2 §62 at the
 * pixel level). After a clip is verified in storage, its start, middle and end
 * frames (W18) are reviewed against the Continuity Engine's corrected
 * generation context and the shot's planned camera.
 *
 *   VISUAL_REVIEW=record   (default) a contradiction is a recorded major
 *                          degradation; the shot still becomes READY
 *   VISUAL_REVIEW=enforce  a contradiction fails the shot (VISUAL_REVIEW_FAILED)
 *   VISUAL_REVIEW=off      no review
 *
 * Record is the default because the reviewer is not yet calibrated on real
 * output; a review that could not run is itself recorded, never a silent pass.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { degradation, type Degradation } from "@cineforge/shared";
import { SCORE_DIMENSIONS, type GenerationContext, type RequestImage, type VisualReviewResult } from "@cineforge/movie";
import type { GateFinding, GateResult } from "../quality/gates";
import { REVIEW_POINTS } from "../quality/measure";

export type VisualReviewMode = "off" | "record" | "enforce";

export function visualReviewMode(env: Record<string, string | undefined> = process.env): VisualReviewMode {
  const v = env.VISUAL_REVIEW;
  return v === "off" || v === "enforce" ? v : "record";
}

export interface VisualGateDeps {
  /** Whether a vision route is configured. */
  available(): boolean;
  /** The frames to review, in time order (start, middle, end for a clip). */
  grabFrames(videoKey: string): Promise<RequestImage[]>;
  review(ctx: GenerationContext, frames: RequestImage[]): Promise<VisualReviewResult>;
}

export interface VisualGateOutcome {
  gaps: Degradation[];
  /** Set in enforce mode when the frame contradicts canon. */
  failure?: string;
  /** Share of verified canon items that match (null = nothing verified / not reviewed). */
  qcScore: number | null;
  result?: VisualReviewResult;
}

export async function gateVisual(
  deps: VisualGateDeps,
  mode: VisualReviewMode,
  ctx: GenerationContext,
  videoKey: string,
  shotId: string,
): Promise<VisualGateOutcome> {
  if (mode === "off") return { gaps: [], qcScore: null };
  const unavailable = (reason: string) => ({
    gaps: [degradation("VISUAL_REVIEW_UNAVAILABLE", "shot", "This shot's frames were not checked against the film's canon.", {
      refId: shotId, detail: { reason },
    })],
    qcScore: null,
  });
  if (!deps.available()) return unavailable("no vision provider configured (visual_review route)");
  let result: VisualReviewResult;
  try {
    const frames = await deps.grabFrames(videoKey);
    if (!frames.length) throw new Error("no frame could be taken from the clip");
    result = await deps.review(ctx, frames);
  } catch (e) {
    return unavailable(e instanceof Error ? e.message.slice(0, 200) : String(e));
  }
  const verified = result.findings.filter((f) => f.status !== "cannot_tell");
  const qcScore = verified.length ? verified.filter((f) => f.status === "match").length / verified.length : null;
  console.log(JSON.stringify({
    event: "visual.review", shotId, passed: result.passed, unverified: result.unverified, qcScore, scores: result.scores, provider: result.provider, model: result.model,
  }));
  if (result.passed) return { gaps: [], qcScore, result };
  const blocking = result.findings.filter((f) => f.blocking);
  const summary = blocking.map((f) => `${f.check} ${f.subjectId}: ${f.observation}`).join("; ");
  if (mode === "enforce") return { gaps: [], failure: `VISUAL_REVIEW_FAILED: ${summary}`.slice(0, 500), qcScore, result };
  return {
    gaps: [degradation("VISUAL_REVIEW_FLAGGED", "shot", "The generated shot appears to contradict the film's canon (see detail).", {
      refId: shotId, detail: { findings: blocking, reviewer: `${result.provider}:${result.model}` },
    })],
    qcScore,
    result,
  };
}

/** JPEG frames near the start, at the middle and near the end of a stored clip (ffmpeg; W18). */
export function frameGrabber(
  download: (key: string, dest: string) => Promise<void>,
  ffmpeg: (args: string[]) => Promise<void>,
  probeDuration: (path: string) => Promise<number>,
): (videoKey: string) => Promise<RequestImage[]> {
  return async (videoKey) => {
    const dir = await mkdtemp(join(tmpdir(), "cf-review-"));
    try {
      const clip = join(dir, "clip.mp4");
      await download(videoKey, clip);
      const d = await probeDuration(clip);
      const points = d >= 1 ? REVIEW_POINTS : [0.5];
      const frames: RequestImage[] = [];
      for (const [i, at] of points.entries()) {
        const out = join(dir, `frame-${i}.jpg`);
        await ffmpeg(["-y", "-ss", Math.max(0, d * at).toFixed(3), "-i", clip, "-frames:v", "1", "-vf", "scale=768:-2", "-q:v", "4", out]);
        frames.push({ mediaType: "image/jpeg", data: (await readFile(out)).toString("base64") });
      }
      return frames;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}

/** The visual gate's outcome as a gate-chain result (quality_gate_results). */
export function visualGateResult(o: VisualGateOutcome, mode: VisualReviewMode): GateResult {
  if (mode === "off") return { gate: "visual", outcome: "skipped", findings: [] };
  if (!o.result) {
    return { gate: "visual", outcome: "skipped", findings: o.gaps.map((g) => ({ code: g.code, severity: "warn" as const, message: g.message, detail: g.detail })) };
  }
  const findings: GateFinding[] = o.result.findings.filter((f) => f.status === "mismatch").map((f) => ({
    code: `VISUAL_${f.check.toUpperCase()}_MISMATCH`, severity: f.blocking ? (mode === "enforce" ? "fail" as const : "warn" as const) : "warn" as const,
    message: `${f.subjectId}: ${f.observation}`,
  }));
  const outcome = o.failure ? "fail" : findings.length ? "warn" : "pass";
  // The reviewer's per-dimension scores (W18) ride along as an info finding: on record, never a defect.
  const s = o.result.scores;
  if (s) {
    findings.push({
      code: "VISUAL_SCORES", severity: "info",
      message: SCORE_DIMENSIONS.map((d) => `${d} ${s[d] ?? "n/a"}`).join(", "),
      detail: { ...s, reviewer: `${o.result.provider}:${o.result.model}` },
    });
  }
  return { gate: "visual", outcome, findings };
}
