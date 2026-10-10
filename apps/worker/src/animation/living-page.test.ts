import { describe, expect, it } from "vitest";
import { animatePage, livingPageMode, livingPagePrompt } from "./living-page";

describe("character animation inside the page (W26; Part 5 §181.4–5)", () => {
  it("is off unless asked for, and only for pages with characters in 'characters' mode", () => {
    expect(livingPageMode({})).toBe("off");
    expect(livingPageMode({ STILL_MOTION_ANIMATE: "characters" })).toBe("characters");
    expect(livingPageMode({ STILL_MOTION_ANIMATE: "yes" })).toBe("off");
    expect(animatePage("off", true, null, 1)).toEqual({ animate: false });
    expect(animatePage("characters", false, null, 1)).toEqual({ animate: false });
    expect(animatePage("characters", true, null, 1)).toEqual({ animate: true });
    expect(animatePage("all", false, 10_000_000, 330_000)).toEqual({ animate: true });
  });
  it("never spends past the film's budget: no room, no animation (and the reason)", () => {
    expect(animatePage("all", true, 100_000, 330_000)).toEqual({ animate: false, reason: "the film's budget has no room for an animated page" });
  });
  it("the prompt keeps the drawing and moves the characters", () => {
    const p = livingPagePrompt("Kito waves from the boat.", "storybook");
    expect(p).toContain("Kito waves from the boat.");
    expect(p).toContain("Animate this illustrated storybook page as it is drawn");
    expect(p).toContain("stay exactly as drawn");
  });
});
