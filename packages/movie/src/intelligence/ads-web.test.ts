import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { FACT_KINDS, type SourceFact } from "./site";

// The Ads Studio page's own logic (apps/web/lib/ads-studio.ts has no imports, so it is tested here beside
// the site analysis it mirrors; the web app has no test runner of its own). Loaded by path: it is outside
// this package's sources.
type State = Record<string, unknown>;
interface AdsStudioWeb {
  AD_SCENES: unknown[];
  FACT_LABEL: Record<string, string>;
  defaultBrandRole(f: { name: string; type: string }, hasLogo: boolean): string;
  directorBrief(s: State): string;
  handoffHref(s: State, id?: string): string;
  sceneInstructions(scene: { index: number; heading: string; summary: string; durationSec: number; firstLine: string | null; narration: string | null }, d: { visual: string; line: string; seconds: number }): string[];
}
let web: AdsStudioWeb;
beforeAll(async () => {
  web = (await import(resolve(__dirname, "../../../../apps/web/lib/ads-studio.ts"))) as AdsStudioWeb;
});
const state = (over: State = {}): State => ({
  url: "https://flyttgo.example/", brief: "Recruit van owners.", duration: "30 seconds", style: "Cinematic premium",
  assets: "AI + my assets", voice: "Professional narrator", formats: ["9:16 Vertical"], uploaded: [], scenes: web.AD_SCENES, ...over,
});

describe("the Ads Studio page (docs/47)", () => {
  it("labels every kind of source fact the Director plans from", () => {
    expect(Object.keys(web.FACT_LABEL)).toEqual([...FACT_KINDS]);
    const fact: SourceFact = { kind: "call_to_action", statement: "s", quote: "q" };
    expect(web.FACT_LABEL[fact.kind]).toBe("Call to action");
  });

  it("puts the page's quoted facts in the hand-off brief", () => {
    const brief = web.directorBrief(state({
      analysis: { url: "https://flyttgo.example/", title: "Flyttgo", brand: "Flyttgo", dropped: 0, fetchedAt: "t",
        facts: [{ kind: "benefit", statement: "Drivers keep most of each fare.", quote: "Drivers keep 85% of every job’s fare." }] },
    }));
    expect(brief).toContain("Source facts from the page (claim nothing beyond them):");
    expect(brief).toContain('- Benefit: Drivers keep most of each fare. (page: "Drivers keep 85% of every job’s fare.")');
    expect(web.directorBrief(state())).not.toContain("Source facts");
    const href = new URL(web.handoffHref(state(), "abc12345"), "https://x.example");
    expect(href.pathname).toBe("/create/advert");
    expect(href.searchParams.get("handoff")).toBe("abc12345");
    expect(href.searchParams.get("aspect")).toBe("9:16");
    expect(new URL(web.handoffHref(state()), "https://x.example").searchParams.has("handoff")).toBe(false);
  });

  it("sends images as a logo or product photos, anything else stays in the browser", () => {
    expect(web.defaultBrandRole({ name: "acme-logo.png", type: "image/png" }, false)).toBe("logo");
    expect(web.defaultBrandRole({ name: "acme-logo.png", type: "image/png" }, true)).toBe("product");
    expect(web.defaultBrandRole({ name: "bottle.jpg", type: "image/jpeg" }, false)).toBe("product");
    expect(web.defaultBrandRole({ name: "logo.svg", type: "image/svg+xml" }, false)).toBe("other");
    expect(web.defaultBrandRole({ name: "deck.pdf", type: "application/pdf" }, false)).toBe("other");
  });

  it("turns a live scene edit into Director instructions: the scene's look and words in one, its length in another", () => {
    const scene = { index: 2, heading: "EXT. HARBOUR - DAY", summary: "A van pulls up.", durationSec: 6, firstLine: "Drive. Deliver. Earn.", narration: null };
    expect(web.sceneInstructions(scene, { visual: "A van pulls up.", line: "Drive. Deliver. Earn.", seconds: 6 })).toEqual([]);
    expect(web.sceneInstructions(scene, { visual: "Golden hour, slow push-in on the van.", line: "Drive. Deliver. Earn.", seconds: 6 })).toEqual([
      'Revise scene 3 ("EXT. HARBOUR - DAY"): Golden hour, slow push-in on the van. Keep who is in it and what happens; keep every claim to the source facts.',
    ]);
    const both = web.sceneInstructions(scene, { visual: "A van pulls up.", line: "Your van. Your hours.", seconds: 9 });
    expect(both).toEqual([
      'Revise scene 3 ("EXT. HARBOUR - DAY"). Its spoken line should become: "Your van. Your hours." Keep who is in it and what happens; keep every claim to the source facts.',
      'Make scene 3 ("EXT. HARBOUR - DAY") 9 seconds long (it runs 6 s now).',
    ]);
    expect(web.sceneInstructions(scene, { visual: "", line: "", seconds: 1 })).toEqual([]);
  });
});
