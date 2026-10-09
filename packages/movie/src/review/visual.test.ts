import { describe, expect, it } from "vitest";
import { mayaCoatFixture } from "../ir/fixture";
import { IntelligenceRouter } from "../intelligence/router";
import type { IntelligenceProvider, StructuredRequest } from "../intelligence/types";
import { checkContinuity } from "../world/continuity";
import { judgeReview, meanScore, renderReviewRequest, reviewFrame } from "./visual";

const ctx = () => checkContinuity(mayaCoatFixture(), { sceneId: "scene_11", shotIndex: 1 }).correctedGenerationContext;

describe("Visual Reviewer", () => {
  it("asks about exactly the canon the shot must show", () => {
    const text = renderReviewRequest(ctx());
    expect(text).toContain("- Maya (char_maya), age 29: face angular face, dark brown eyes; hair short red hair");
    expect(text).toContain("marks scar above left eyebrow; wearing long red wool coat");
    expect(text).toContain("Location: The Harbour (loc_harbour)");
    expect(text).toContain("Time: night");
  });

  it("only a clear mismatch on a defining check fails; cannot_tell is unverified, not a pass or a failure", () => {
    const ok = judgeReview({ verdicts: [
      { check: "wardrobe", subjectId: "char_maya", status: "match", observation: "red coat" },
      { check: "identity", subjectId: "char_maya", status: "cannot_tell", observation: "face turned away" },
      { check: "time", subjectId: "scene", status: "mismatch", observation: "looks like dusk" },
    ] }, "anthropic", "m");
    expect(ok).toMatchObject({ passed: true, unverified: 1 });
    const bad = judgeReview({ verdicts: [{ check: "wardrobe", subjectId: "char_maya", status: "mismatch", observation: "yellow raincoat" }] }, "anthropic", "m");
    expect(bad.passed).toBe(false);
    expect(bad.findings[0]!.blocking).toBe(true);
  });

  it("v2 (W18): a clip is described as start / middle / end with its planned camera; a still asks no camera verdict", () => {
    const clip = renderReviewRequest(ctx(), { kind: "clip", cameraType: "medium", cameraMovement: "slow push-in" });
    expect(clip).toContain("Frames: start, middle and end of the generated clip, in order.");
    expect(clip).toContain("Planned camera: medium, slow push-in");
    expect(clip).toContain("Shot prompt: ");
    const still = renderReviewRequest(ctx());
    expect(still).toContain("Frame: one generated still.");
    expect(still).not.toContain("Planned camera");
  });

  it("v2: hands, objects and camera mismatches are advisory; scores are kept and averaged over what could be judged", () => {
    const r = judgeReview({
      verdicts: [
        { check: "hands", subjectId: "char_maya", status: "mismatch", observation: "fused fingers" },
        { check: "objects", subjectId: "scene", status: "mismatch", observation: "the lamp floats" },
        { check: "camera", subjectId: "shot", status: "mismatch", observation: "no push-in" },
      ],
      scores: { identity: 80, composition: 60, continuity: null, lighting: 70, promptAdherence: 90 },
    }, "anthropic", "m");
    expect(r.passed).toBe(true);
    expect(r.findings.every((f) => !f.blocking)).toBe(true);
    expect(meanScore(r.scores)).toBeCloseTo(0.75);
    expect(meanScore(null)).toBeNull();
    expect(judgeReview({ verdicts: [] }, "a", "m").scores).toBeNull();
  });

  it("sends the frame as an image through the router (visual_review task)", async () => {
    const seen: StructuredRequest[] = [];
    const provider: IntelligenceProvider = {
      id: "anthropic", configured: () => true,
      async generateStructured(req, model) {
        seen.push(req);
        return { output: { verdicts: [{ check: "presence", subjectId: "char_maya", status: "match", observation: "she is there" }] }, provider: "anthropic", model, usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 };
      },
    };
    const decisions: unknown[] = [];
    const router = new IntelligenceRouter([provider], {}, (d) => { decisions.push(d); });
    const r = await reviewFrame(router, ctx(), [{ mediaType: "image/jpeg", data: "AAAA" }], { projectId: "p" });
    expect(r.passed).toBe(true);
    expect(seen[0]!.task).toBe("visual_review");
    expect(seen[0]!.images).toEqual([{ mediaType: "image/jpeg", data: "AAAA" }]);
    expect(decisions).toEqual([expect.objectContaining({ task: "visual_review", promptId: "review.visual", outcome: "ok" })]);
  });
});
