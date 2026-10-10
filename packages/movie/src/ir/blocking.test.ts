import { describe, expect, it } from "vitest";
import { compileFor } from "../prompt/compilers";
import { compileGeneration } from "../prompt/canonical";
import { renderReviewRequest } from "../review/visual";
import { checkContinuity } from "../world/continuity";
import { fixturePackage } from "./fixture";
import { blockingPhrase } from "./schema";
import { validateCanon } from "./validate";

/** Scene 1, shot 1 frames Maya; place her. */
function placed() {
  const p = fixturePackage();
  const sc = p.scenes[0]!;
  const sh = sc.shots.find((s) => s.subjectIds.includes("char_maya"))!;
  sh.blocking = [{ characterId: "char_maya", x: "left", depth: "foreground" }];
  return { p, sc, sh };
}

describe("blocking: where each framed character stands (W27)", () => {
  it("reads as a phrase", () => {
    expect(blockingPhrase({ x: "left", depth: "foreground" })).toBe("left third, foreground");
    expect(blockingPhrase({ x: "center", depth: "background" })).toBe("center, background");
  });

  it("places only framed characters, each once", () => {
    const { p, sh } = placed();
    expect(validateCanon(p).filter((i) => i.code.startsWith("BLOCKING"))).toEqual([]);
    sh.blocking = [{ characterId: "char_harbourmaster", x: "right", depth: "midground" }, { characterId: "char_maya", x: "left", depth: "foreground" }, { characterId: "char_maya", x: "right", depth: "foreground" }];
    expect(validateCanon(p).filter((i) => i.code.startsWith("BLOCKING")).map((i) => i.code).sort()).toEqual(["BLOCKING_DUPLICATE", "BLOCKING_NOT_IN_FRAME"]);
  });

  it("goes into the shot's prompt and the reviewer's request; absent, nothing changes", () => {
    const { p, sc, sh } = placed();
    const req = compileGeneration(p, sc.id, sh.index);
    expect(req.visualIntent.subjects.find((s) => s.id === "char_maya")?.position).toBe("left third, foreground");
    expect(compileFor("wan2.1-t2v", req).prompt).toContain("(left third, foreground)");
    const ctx = checkContinuity(p, { sceneId: sc.id, shotIndex: sh.index }).correctedGenerationContext;
    expect(renderReviewRequest(ctx)).toContain("placed left third, foreground");
    const plain = fixturePackage();
    const r = compileGeneration(plain, sc.id, sh.index);
    expect(r.visualIntent.subjects.every((s) => !("position" in s))).toBe(true);
    expect(renderReviewRequest(checkContinuity(plain, { sceneId: sc.id, shotIndex: sh.index }).correctedGenerationContext)).not.toContain("placed");
  });
});
