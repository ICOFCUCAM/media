import { describe, expect, it } from "vitest";
import { buildScorePrompt, scoreSeconds } from "./score";

describe("buildScorePrompt", () => {
  it("folds unique styles and moods with the brief", () => {
    const p = buildScorePrompt("an African kingdom   fighting for independence", [
      { music: "Epic orchestral", mood: "tense" },
      { music: "Epic orchestral", mood: "hopeful" },
      { music: "None", mood: null },
    ]);
    expect(p).toContain("instrumental, no vocals");
    expect(p).toContain("style: Epic orchestral");
    expect(p).not.toContain("None");
    expect(p).toContain("mood: tense, hopeful");
    expect(p).toContain("an African kingdom fighting for independence");
  });
  it("still asks for a score with no direction", () => {
    expect(buildScorePrompt("", [])).toBe("Cinematic film score, instrumental, no vocals");
  });
});

describe("scoreSeconds", () => {
  it("fits the film within the model's range", () => {
    expect(scoreSeconds(30, 47)).toBe(30);
    expect(scoreSeconds(600, 47)).toBe(47);
    expect(scoreSeconds(3, 47)).toBe(10);
    expect(scoreSeconds(0, 47)).toBe(10);
  });
});
