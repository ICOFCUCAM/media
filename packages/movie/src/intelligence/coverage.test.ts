import { describe, expect, it } from "vitest";
import { fixturePackage, FIXTURE_CONSTRAINTS as C } from "../ir/fixture";
import { cinemaAdvisories } from "../cinema/engine";
import { refineCoverage, sceneState } from "./coverage";
import { IntelligenceRouter } from "./router";
import type { IntelligenceProvider, StructuredRequest } from "./types";

class FakeProvider implements IntelligenceProvider {
  readonly id = "anthropic";
  calls: StructuredRequest[] = [];
  constructor(private readonly replies: (unknown | Error)[]) {}
  configured() { return true; }
  async generateStructured(req: StructuredRequest, model: string) {
    this.calls.push(req);
    const r = this.replies.shift();
    if (r instanceof Error) throw r;
    return { output: r, provider: this.id, model, usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 };
  }
}

/** The fixture with no grammar problems (Maya keeps facing left across her two shots). */
function clean() {
  const p = fixturePackage();
  for (const sc of p.scenes) sc.shots[2]!.screenDirection = "left";
  return p;
}

/** Then scene one opens on a medium shot: no establishing wide. */
function flagged() {
  const p = clean();
  const good = structuredClone(p.scenes[0]!.shots);
  p.scenes[0]!.shots[0]!.size = "MS";
  return { p, good };
}

describe("the Cinematographer's pass (W24; Part 1 §11, §26)", () => {
  it("sends one scene's relevant state only, and keeps a redesign that fixes the grammar", async () => {
    const { p, good } = flagged();
    expect(cinemaAdvisories(p).map((a) => `${a.sceneId}/${a.code}`)).toContain("scene_01/NO_ESTABLISHING_SHOT");
    const fake = new FakeProvider([{ shots: good }]);
    const r = await refineCoverage(new IntelligenceRouter([fake], {}), p, C);
    expect(r.revisions).toEqual([{ sceneId: "scene_01", before: ["NO_ESTABLISHING_SHOT"], after: [], kept: true }]);
    expect(r.pkg.scenes[0]!.shots[0]!.size).toBe("WS");
    expect(r.pkg.scenes[1]).toEqual(p.scenes[1]); // other scenes untouched
    const sent = JSON.parse(fake.calls[0]!.user);
    expect(fake.calls[0]!.task).toBe("shot_design");
    expect(sent.state.scene.id).toBe("scene_01");
    expect(sent.keep).toEqual({ totalSec: 18, maxShots: 4, maxShotSec: 5 });
    expect(sent.problems[0]).toMatch(/establishing wide/);
    // Relevant state, not the film: no other scene, no full cast records.
    expect(JSON.stringify(sent)).not.toContain("scene_02");
    expect(sent.state.goals).toEqual([{ who: "char_maya", want: "deliver the key before the bridge swings", status: "advanced" }]);
  });

  it("refuses a redesign that changes the scene's length, and keeps the Director's shots", async () => {
    const { p, good } = flagged();
    good[0]!.durationSec = 2; // 15 s instead of 18
    const r = await refineCoverage(new IntelligenceRouter([new FakeProvider([{ shots: good }])], {}), p, C);
    expect(r.revisions[0]).toMatchObject({ sceneId: "scene_01", kept: false });
    expect(r.revisions[0]!.reason).toMatch(/^invalid/);
    expect(r.pkg).toEqual(p);
  });

  it("a redesign that is no better, or a failed call, leaves the plan as it was", async () => {
    const { p } = flagged();
    const same = await refineCoverage(new IntelligenceRouter([new FakeProvider([{ shots: p.scenes[0]!.shots }])], {}), p, C);
    expect(same.revisions[0]).toMatchObject({ kept: false, reason: "no fewer grammar problems" });
    const failed = await refineCoverage(new IntelligenceRouter([new FakeProvider([new Error("boom")])], {}), p, C);
    expect(failed.revisions[0]!.kept).toBe(false);
    expect(failed.pkg).toEqual(p);
  });

  it("a film with no grammar problems makes no call", async () => {
    const fake = new FakeProvider([]);
    expect(cinemaAdvisories(clean())).toEqual([]);
    const r = await refineCoverage(new IntelligenceRouter([fake], {}), clean(), C);
    expect(r.revisions).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  it("the scene state carries relationships, goals and how the previous scene ended", () => {
    const s = sceneState(fixturePackage(), 1);
    expect(s.relationships).toEqual([{ a: "char_maya", b: "char_harbourmaster", state: "trust" }]);
    expect(s.previous).toEqual({ sameLocation: true, lastShot: { size: "MCU", side: "A", screenDirection: "left" } });
  });
});
