import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DecisionRecord } from "@cineforge/movie";
import { _resetDecisionState, recordDecision } from "./index";

const d: DecisionRecord = {
  task: "film_plan", promptId: "director.master", promptVersion: 1, schemaName: "FilmPackage", provider: "anthropic",
  model: "claude-opus-5-5", inputSha256: "a".repeat(64), outputSha256: "b".repeat(64), outcome: "ok", errorCode: null,
  issues: 0, inputTokens: 1, outputTokens: 2, latencyMs: 3, projectId: "p1", attempt: 0,
};

beforeEach(() => {
  _resetDecisionState();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("AI decision log (DOS-48)", () => {
  it("writes the row and the log line", async () => {
    const create = vi.fn(async () => ({}));
    expect(await recordDecision({ aiDecision: { create } }, d)).toBe("recorded");
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ task: "film_plan", promptVersion: 1, outcome: "ok" }) });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"event":"ai.decision"'));
  });

  it("logs only (once) until 0032 is applied", async () => {
    const create = vi.fn(async () => { throw Object.assign(new Error("relation does not exist"), { code: "P2021" }); });
    expect(await recordDecision({ aiDecision: { create } }, d)).toBe("logged");
    expect(await recordDecision({ aiDecision: { create } }, d)).toBe("logged");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
