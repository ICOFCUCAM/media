import { describe, expect, it } from "vitest";
import { checkContinuity, judgeReview, mayaCoatFixture, type VisualReviewOutput } from "@cineforge/movie";
import { gateVisual, visualReviewMode, type VisualGateDeps } from "./visual-gate";

const ctx = checkContinuity(mayaCoatFixture(), { sceneId: "scene_11", shotIndex: 1 }).correctedGenerationContext;
const deps = (out: VisualReviewOutput | Error, available = true): VisualGateDeps => ({
  available: () => available,
  grabFrame: async () => ({ mediaType: "image/jpeg", data: "AAAA" }),
  review: async () => { if (out instanceof Error) throw out; return judgeReview(out, "anthropic", "claude-opus-5-5"); },
});
const yellow: VisualReviewOutput = { verdicts: [
  { check: "presence", subjectId: "char_maya", status: "match", observation: "a woman with short red hair" },
  { check: "wardrobe", subjectId: "char_maya", status: "mismatch", observation: "yellow raincoat, not a red coat" },
  { check: "identity", subjectId: "char_maya", status: "cannot_tell", observation: "face in shadow" },
] };

describe("visual quality gate", () => {
  it("defaults to record mode", () => {
    expect(visualReviewMode({})).toBe("record");
    expect(visualReviewMode({ VISUAL_REVIEW: "enforce" })).toBe("enforce");
    expect(visualReviewMode({ VISUAL_REVIEW: "off" })).toBe("off");
  });

  it("record: a contradiction is a major degradation with the findings; the shot is not failed", async () => {
    const r = await gateVisual(deps(yellow), "record", ctx, "clip.mp4", "shot-1");
    expect(r.failure).toBeUndefined();
    expect(r.qcScore).toBe(0.5);
    expect(r.gaps).toEqual([expect.objectContaining({ code: "VISUAL_REVIEW_FLAGGED", severity: "major", refId: "shot-1" })]);
    expect((r.gaps[0]!.detail!.findings as { check: string }[])[0]!.check).toBe("wardrobe");
  });

  it("enforce: a contradiction fails the shot", async () => {
    const r = await gateVisual(deps(yellow), "enforce", ctx, "clip.mp4", "shot-1");
    expect(r.failure).toMatch(/^VISUAL_REVIEW_FAILED: wardrobe char_maya: yellow raincoat/);
  });

  it("a match passes with a score; a review that could not run is recorded, never a silent pass", async () => {
    const ok = await gateVisual(deps({ verdicts: [{ check: "wardrobe", subjectId: "char_maya", status: "match", observation: "red coat" }] }), "enforce", ctx, "c", "s");
    expect(ok).toMatchObject({ gaps: [], qcScore: 1 });
    const none = await gateVisual(deps(yellow, false), "record", ctx, "c", "s");
    expect(none.gaps.map((g) => g.code)).toEqual(["VISUAL_REVIEW_UNAVAILABLE"]);
    const err = await gateVisual(deps(new Error("ffmpeg: no frames")), "enforce", ctx, "c", "s");
    expect(err.failure).toBeUndefined();
    expect(err.qcScore).toBeNull();
    expect(err.gaps[0]!.detail).toEqual({ reason: "ffmpeg: no frames" });
    expect(await gateVisual(deps(yellow), "off", ctx, "c", "s")).toEqual({ gaps: [], qcScore: null });
  });
});
