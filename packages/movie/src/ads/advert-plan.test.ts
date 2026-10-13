import { describe, expect, it } from "vitest";
import { validateFilmPackage } from "../ir/validate";
import { productShots } from "../intelligence/site";
import { AD_WORDS_PER_SCENE, advertConstraints, advertPackage, advertStoryboard, beatPlan, storyboardIssues, type AdvertBrief } from "./advert-plan";

const FACTS: AdvertBrief["facts"] = [
  { kind: "product", statement: "Flyttgo connects van owners with people who need things moved.", quote: "Flyttgo connects van owners with people who need things moved." },
  { kind: "benefit", statement: "Fixed price before you book.", quote: "Fixed price before you book" },
  { kind: "benefit", statement: "Track your van live on the map.", quote: "Track your van live on the map" },
  { kind: "audience", statement: "Built for busy families and small businesses.", quote: "Built for busy families and small businesses that need a hand." },
  { kind: "call_to_action", statement: "The page invites visitors to \"Book a move\".", quote: "Book a move" },
];

const brief = (over: Partial<AdvertBrief> = {}): AdvertBrief => ({
  brief: "Introduce Flyttgo and get people to book their next move.", seconds: 30, style: "Cinematic premium", voice: "narrator",
  url: "https://www.flyttgo.example/", brand: "Flyttgo", facts: FACTS, productPhotos: 2, logo: true, ...over,
});

describe("Ads Studio writer (W32)", () => {
  it("splits every length into beats whose scenes add up exactly", () => {
    for (const s of [6, 10, 15, 20, 25, 30, 45, 60, 90, 120]) {
      const n = Math.round(s / 5);
      expect(beatPlan(s).reduce((a, b) => a + b.scenes, 0)).toBe(n);
    }
    expect(beatPlan(30).map((b) => b.beat)).toEqual(["opening", "problem", "solution", "how", "outcome", "cta"]);
    expect(beatPlan(15).map((b) => b.beat)).toEqual(["opening", "solution", "cta"]);
  });

  it("produces a package the Director's validators accept, for every length, style and voice, with or without a link", () => {
    for (const seconds of [15, 30, 60, 90]) {
      for (const style of ["Cinematic premium", "Corporate professional", "Energetic social advert", "Product demonstration", "Documentary storytelling"]) {
        for (const voice of ["narrator", "none"] as const) {
          for (const facts of [FACTS, []]) {
            const b = brief({ seconds, style, voice, facts, brand: facts.length ? "Flyttgo" : null, url: facts.length ? "https://flyttgo.example" : null });
            const board = advertStoryboard(b);
            expect(storyboardIssues(board, seconds, voice)).toEqual([]);
            const v = validateFilmPackage(advertPackage(b, board), advertConstraints(seconds));
            expect(v.issues, `${seconds}s ${style} ${voice} facts=${facts.length}`).toEqual([]);
          }
        }
      }
    }
  });

  it("speaks only the owner's brief and the page's own quotes, and each line fits its scene", () => {
    const b = brief({ seconds: 60 });
    const board = advertStoryboard(b);
    const said = board.map((s) => s.message).join(" ");
    expect(said).toContain("Flyttgo connects van owners with people who need things moved.");
    expect(said).toContain("Book a move at flyttgo.example.");
    const pkg = advertPackage(b, board);
    for (const sc of pkg.scenes) if (sc.narration) expect(sc.narration.split(/\s+/).length).toBeLessThanOrEqual(AD_WORDS_PER_SCENE);
    expect(advertPackage(brief({ voice: "none" }), board).scenes.every((s) => s.narration === null)).toBe(true);
  });

  it("puts the product in the shots that show it, so supplied product photos guide them", () => {
    const pkg = advertPackage(brief(), advertStoryboard(brief()));
    expect(productShots(pkg).length).toBeGreaterThan(0);
  });

  it("an edited storyboard whose lengths no longer add up, or whose line is too long, is reported, not produced", () => {
    const board = advertStoryboard(brief());
    board[0] = { ...board[0]!, seconds: 15 };
    expect(storyboardIssues(board, 30, "narrator")[0]).toMatch(/add up to 40 s/);
    const long = advertStoryboard(brief()).map((s, i) => (i === 1 ? { ...s, message: "word ".repeat(20) } : s));
    expect(storyboardIssues(long, 30, "narrator")[0]).toMatch(/20 words/);
  });
});
