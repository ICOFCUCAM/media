import { describe, expect, it } from "vitest";
import { mayaCoatFixture } from "../ir/fixture";
import { canonDigest, interpretInstruction, pruneChange } from "./interpret";
import { IntelligenceRouter, parseRoutes } from "./router";
import type { DecisionRecord, IntelligenceProvider, StructuredRequest } from "./types";

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

const pkg = mayaCoatFixture();

describe("director workspace instructions (W9)", () => {
  it("routes edit_interpret like every task (Claude by default)", () => {
    expect(parseRoutes({}).edit_interpret).toEqual([{ provider: "anthropic", model: "claude-opus-5-5" }]);
  });

  it("asks with the canon ids only and returns one pruned change with the reply and a logged why", async () => {
    const decisions: DecisionRecord[] = [];
    const fake = new Fake({
      action: "change",
      reply: "Maya will wear a red coat from the harbour scene on.",
      change: { kind: "scene_wardrobe", sceneId: "scene_12", characterId: "char_maya", wardrobe: { id: "wardrobe_red_wool", description: "red wool coat" }, propId: "", patch: {}, physical: null },
    });
    const router = new IntelligenceRouter([fake], {}, (d) => { decisions.push(d); });
    const r = await interpretInstruction(router, pkg, "Make Maya's coat red from the harbour on", { projectId: "p1" });
    expect(r).toEqual({
      action: "change",
      reply: "Maya will wear a red coat from the harbour scene on.",
      change: { kind: "scene_wardrobe", sceneId: "scene_12", characterId: "char_maya", wardrobe: { id: "wardrobe_red_wool", description: "red wool coat" } },
    });
    const sent = JSON.parse(fake.seen[0]!.user) as { instruction: string; canon: { cast: { id: string }[] } };
    expect(sent.canon.cast.map((c) => c.id)).toContain("char_maya");
    expect(fake.seen[0]!.task).toBe("edit_interpret");
    expect(decisions[0]!.summary).toMatch(/as a scene_wardrobe change: Maya will wear/);
  });

  it("an instruction that is not a canon change comes back as none with the reason", async () => {
    const router = new IntelligenceRouter([new Fake({ action: "none", change: { kind: "prop" }, reply: "I can't change the camera from here — try the shot plan." })], {});
    const r = await interpretInstruction(router, pkg, "Use a drone shot in scene 2");
    expect(r).toEqual({ action: "none", change: null, reply: "I can't change the camera from here — try the shot plan." });
  });

  it("the digest carries ids, names and states, not the whole package", () => {
    const d = canonDigest(pkg) as { cast: unknown[]; scenes: { id: string; characters: unknown[] }[] };
    expect(d.scenes[0]!.id).toBe(pkg.scenes[0]!.id);
    expect(JSON.stringify(d).length).toBeLessThan(JSON.stringify(pkg).length);
  });

  it("pruning keeps a deliberate null physical (clears an injury) and drops other empties", () => {
    expect(pruneChange({ kind: "physical", sceneId: "scene_1", characterId: "char_maya", physical: null, wardrobe: {}, age: null })).toEqual({
      kind: "physical", sceneId: "scene_1", characterId: "char_maya", physical: null,
    });
    expect(pruneChange("nope")).toBeNull();
  });

  it("a summarizer that throws never breaks the call", async () => {
    const decisions: DecisionRecord[] = [];
    const router = new IntelligenceRouter([new Fake({ ok: 1 })], {}, (d) => { decisions.push(d); });
    await router.call({ task: "translation", promptId: "t", promptVersion: 1, system: "", user: "", schema: {}, schemaName: "X", maxTokens: 1, summarize: () => { throw new Error("boom"); } });
    expect(decisions[0]!.summary).toBeNull();
  });
});
