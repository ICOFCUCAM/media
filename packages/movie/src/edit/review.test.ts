import { describe, expect, it } from "vitest";
import { fixturePackage, mayaCoatFixture } from "../ir/fixture";
import { interpretInstruction } from "../intelligence/interpret";
import { PROMPTS } from "../intelligence/prompts";
import { IntelligenceRouter, parseRoutes } from "../intelligence/router";
import type { DecisionRecord, IntelligenceProvider, StructuredRequest } from "../intelligence/types";
import { checkReview, EDITOR_QUESTIONS, EDITOR_SCHEMA, editorialDigest, reviewFilm, toOperation } from "./review";

class Fake implements IntelligenceProvider {
  readonly id = "anthropic";
  seen: StructuredRequest[] = [];
  constructor(private readonly reply: unknown) {}
  configured() { return true; }
  async generateStructured(req: StructuredRequest, model: string) {
    this.seen.push(req);
    return { output: this.reply, provider: this.id, model, usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 };
  }
}

const nulls = { shotIndex: null, toSec: null, afterSceneId: null, afterShotIndex: null, subjectId: null, action: null, durationSec: null, lineIndex: null };

describe("Editorial Intelligence (Part 1 §21, §46)", () => {
  it("routes the editorial task like every task (Claude by default)", () => {
    expect(parseRoutes({}).editorial).toEqual([{ provider: "anthropic", model: "claude-opus-5-5" }]);
  });

  it("the editor sees the cut on the clock: scene and shot timecodes, numbered lines", () => {
    const d = editorialDigest(fixturePackage()) as { runtimeSec: number; scenes: { at: string; shots: { at: string; sec: number }[]; lines: { line: number }[] }[] };
    expect(d.runtimeSec).toBe(36);
    expect(d.scenes[0]!.at).toBe("0:00–0:18");
    expect(d.scenes[1]!.at).toBe("0:18–0:36");
    expect(d.scenes[1]!.shots.map((s) => s.at)).toEqual(["0:18", "0:23", "0:28", "0:32"]);
    expect(d.scenes[0]!.lines[0]!.line).toBe(0);
  });

  it("asks all nine questions and allows only the closed set of operations", () => {
    expect(EDITOR_QUESTIONS).toHaveLength(9);
    const items = (EDITOR_SCHEMA.properties.proposals as { items: { properties: { op: { enum: string[] } } } }).items;
    expect(items.properties.op.enum).toEqual(["CUT_SHOT", "TRIM_SHOT", "EXTEND_SHOT", "SHORTEN_SCENE", "MOVE_SCENE", "ADD_INSERT", "REMOVE_LINE"]);
    for (const q of ["pacing is correct", "opening", "redundant shots", "emotional escalation", "shortened", "climax arrive too early", "ending satisfying", "transitions coherent", "dialogue"]) expect(PROMPTS.editorReview.system).toContain(q === "pacing is correct" ? "pacing correct" : q);
  });

  it("a flat proposal becomes exactly its typed operation", () => {
    expect(toOperation({ ...nulls, op: "TRIM_SHOT", sceneId: "scene_01", shotIndex: 0, toSec: 3, lineIndex: 7, reason: "tighter" }))
      .toEqual({ op: "TRIM_SHOT", sceneId: "scene_01", shotIndex: 0, toSec: 3, reason: "tighter" });
    expect(() => toOperation({ ...nulls, op: "SPEED_UP", sceneId: "scene_01", reason: "x" })).toThrow();
  });

  it("every proposal is dry-run: valid ones carry their cost, impossible ones are dropped with why", () => {
    const review = checkReview(fixturePackage(), {
      summary: "The opening is slow.",
      findings: [
        { question: "opening", verdict: "needs_work", note: "The establishing shot holds too long." },
        { question: "made_up", verdict: "works", note: "ignored" },
      ],
      proposals: [
        { ...nulls, op: "TRIM_SHOT", sceneId: "scene_01", shotIndex: 0, toSec: 3, reason: "faster opening" },
        { ...nulls, op: "EXTEND_SHOT", sceneId: "scene_02", shotIndex: 1, toSec: 7, reason: "let it land" },
        { ...nulls, op: "CUT_SHOT", sceneId: "scene_07", shotIndex: 0, reason: "no such scene" },
        { ...nulls, op: "TELEPORT", sceneId: "scene_01", reason: "not an operation" },
      ],
    });
    expect(review.findings).toEqual([{ question: "opening", verdict: "needs_work", note: "The establishing shot holds too long." }]);
    expect(review.proposals.map((p) => [p.description, p.effect.deltaSec, p.effect.recut, p.effect.regenerate])).toEqual([
      ["Trim scene_01 shot 1 to 3s", -2, 1, 0],
      ["Extend scene_02 shot 2 to 7s", 2, 0, 1],
    ]);
    expect(review.dropped.map((d) => d.reason)).toEqual([expect.stringMatching(/no scene_07/), expect.any(String)]);
  });

  it("a timing request (§46) is sent with the film and comes back as checked edits, logged with the why", async () => {
    const decisions: DecisionRecord[] = [];
    const fake = new Fake({
      summary: "Tightened the first 15 seconds.",
      findings: [{ question: "opening", verdict: "needs_work", note: "Two long holds." }],
      proposals: [
        { ...nulls, op: "TRIM_SHOT", sceneId: "scene_01", shotIndex: 0, toSec: 3, reason: "faster" },
        { ...nulls, op: "TRIM_SHOT", sceneId: "scene_01", shotIndex: 1, toSec: 3, reason: "faster" },
      ],
    });
    const router = new IntelligenceRouter([fake], {}, (d) => { decisions.push(d); });
    const r = await reviewFilm(router, fixturePackage(), { instruction: "Make the opening 15 seconds faster.", projectId: "p1" });
    const sent = JSON.parse(fake.seen[0]!.user) as { request: string; film: { runtimeSec: number } };
    expect(sent.request).toBe("Make the opening 15 seconds faster.");
    expect(sent.film.runtimeSec).toBe(36);
    expect(fake.seen[0]!.task).toBe("editorial");
    expect(r.proposals.reduce((a, p) => a + p.effect.deltaSec, 0)).toBe(-4);
    expect(decisions[0]).toMatchObject({ task: "editorial", promptId: "editor.review", promptVersion: 1 });
  });

  it("the Director chat hands cut and timing requests to the Editor", async () => {
    const fake = new Fake({ action: "editorial", reply: "I've asked the Editor to tighten the opening.", change: null });
    const router = new IntelligenceRouter([fake], {}, () => {});
    const r = await interpretInstruction(router, mayaCoatFixture(), "Make the opening 15 seconds faster.");
    expect(r).toEqual({ action: "editorial", change: null, reply: "I've asked the Editor to tighten the opening." });
    expect(PROMPTS.directorEdit.version).toBe(2);
  });
});
