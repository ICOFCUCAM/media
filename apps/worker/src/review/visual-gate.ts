/**
 * Visual quality gate for generated shots (DirectorOS W5; Part 2 §62 at the
 * pixel level). After a clip is verified in storage, a frame from its middle
 * is reviewed against the Continuity Engine's corrected generation context.
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
import type { GenerationContext, RequestImage, VisualReviewResult } from "@cineforge/movie";

export type VisualReviewMode = "off" | "record" | "enforce";

export function visualReviewMode(env: Record<string, string | undefined> = process.env): VisualReviewMode {
  const v = env.VISUAL_REVIEW;
  return v === "off" || v === "enforce" ? v : "record";
}

export interface VisualGateDeps {
  /** Whether a vision route is configured. */
  available(): boolean;
  grabFrame(videoKey: string): Promise<RequestImage>;
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
    const frame = await deps.grabFrame(videoKey);
    result = await deps.review(ctx, [frame]);
  } catch (e) {
    return unavailable(e instanceof Error ? e.message.slice(0, 200) : String(e));
  }
  const verified = result.findings.filter((f) => f.status !== "cannot_tell");
  const qcScore = verified.length ? verified.filter((f) => f.status === "match").length / verified.length : null;
  console.log(JSON.stringify({
    event: "visual.review", shotId, passed: result.passed, unverified: result.unverified, qcScore, provider: result.provider, model: result.model,
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

/** One JPEG frame from the middle of a stored clip (ffmpeg). */
export function frameGrabber(
  download: (key: string, dest: string) => Promise<void>,
  ffmpeg: (args: string[]) => Promise<void>,
  probeDuration: (path: string) => Promise<number>,
): (videoKey: string) => Promise<RequestImage> {
  return async (videoKey) => {
    const dir = await mkdtemp(join(tmpdir(), "cf-review-"));
    try {
      const clip = join(dir, "clip.mp4");
      const out = join(dir, "frame.jpg");
      await download(videoKey, clip);
      const mid = Math.max(0, (await probeDuration(clip)) / 2);
      await ffmpeg(["-y", "-ss", mid.toFixed(3), "-i", clip, "-frames:v", "1", "-vf", "scale=768:-2", "-q:v", "4", out]);
      return { mediaType: "image/jpeg", data: (await readFile(out)).toString("base64") };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}
