import { describe, expect, it } from "vitest";
import { fixturePackage, FIXTURE_CONSTRAINTS as C } from "../ir/fixture";
import { PROMPTS, renderPlanRequest } from "./prompts";
import { IntelligenceRouter } from "./router";
import { roleOfPrompt } from "./roles";
import {
  adSourceOf, analyseSite, claimAdvisories, claimTerms, findQuote, PRODUCT_PROP_ID, productShots, renderSiteRequest, SITE_TEXT_MAX, verifyFacts,
} from "./site";
import type { IntelligenceProvider, StructuredRequest } from "./types";

class Fake implements IntelligenceProvider {
  readonly id = "anthropic";
  calls: StructuredRequest[] = [];
  constructor(private readonly out: unknown) {}
  configured() { return true; }
  async generateStructured(req: StructuredRequest, model: string) {
    this.calls.push(req);
    return { output: this.out, provider: this.id, model, usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 };
  }
}

const PAGE = [
  "Flyttgo — Drive. Deliver. Earn.",
  "Flyttgo connects van owners with people who need things moved.",
  "Earn money with your own van, on your own schedule.",
  "Drivers keep 85% of every job’s fare.",
  "Made for independent drivers in Oslo and Bergen.",
  "Sign up in minutes and start driving this week.",
].join("\n");

describe("website intelligence (Ads Studio A2)", () => {
  it("finds a quote as the page writes it — case, curly quotes, dashes and line breaks may differ, words may not", () => {
    expect(findQuote(PAGE, "earn money with your own van")).toBe("Earn money with your own van");
    expect(findQuote(PAGE, "every job's fare")).toBe("every job’s fare");
    expect(findQuote(PAGE, "Flyttgo - Drive.")).toBe("Flyttgo — Drive.");
    expect(findQuote(PAGE, "moved.  Earn money")).toBe("moved.\nEarn money");
    expect(findQuote(PAGE, "“Sign up in minutes”")).toBe("Sign up in minutes");
    expect(findQuote(PAGE, "Earn lots of money with your van")).toBeNull();
    expect(findQuote(PAGE, "ok")).toBeNull(); // too short to be evidence
  });

  it("keeps only facts whose quote is on the page, within the per-kind limits", () => {
    const { facts, dropped } = verifyFacts({
      facts: [
        { kind: "product", statement: "A marketplace for van owners.", quote: "Flyttgo connects van owners with people who need things moved." },
        { kind: "product", statement: "Also a second product.", quote: "Earn money with your own van" },
        { kind: "benefit", statement: "Drivers keep most of each fare.", quote: "Drivers keep 85% of every job's fare." },
        { kind: "benefit", statement: "Guaranteed income.", quote: "We guarantee £500 a week." },
        { kind: "audience", statement: "Independent drivers.", quote: "Made for independent drivers in Oslo and Bergen." },
        { kind: "call_to_action", statement: "Sign up.", quote: "Sign up in minutes and start driving this week." },
        { kind: "price", statement: "Free.", quote: "Flyttgo" },
        { kind: "benefit", statement: "", quote: "Earn money" },
      ],
    }, PAGE);
    expect(facts.map((f) => f.kind)).toEqual(["product", "benefit", "audience", "call_to_action"]);
    expect(facts[1]!.quote).toBe("Drivers keep 85% of every job’s fare."); // the page's own characters
    expect(dropped.map((d) => d.reason)).toEqual(["over_limit", "quote_not_on_page", "unknown_kind", "empty"]);
    expect(verifyFacts(null, PAGE)).toEqual({ facts: [], dropped: [] });
  });

  it("asks one site_analysis call with the page as data, and keeps only what the page supports", async () => {
    const fake = new Fake({
      brand: "flyttgo",
      facts: [
        { kind: "benefit", statement: "Flexible hours.", quote: "on your own schedule" },
        { kind: "benefit", statement: "Best pay in Norway.", quote: "the best pay in Norway" },
      ],
    });
    const r = await analyseSite(new IntelligenceRouter([fake], {}), { url: "https://flyttgo.example/", title: "Flyttgo", text: PAGE });
    expect(fake.calls[0]!.task).toBe("site_analysis");
    expect(fake.calls[0]!.promptId).toBe(PROMPTS.siteAnalysis.id);
    expect(JSON.parse(fake.calls[0]!.user)).toEqual({ url: "https://flyttgo.example/", title: "Flyttgo", pageText: PAGE });
    expect(r.facts).toEqual([{ kind: "benefit", statement: "Flexible hours.", quote: "on your own schedule" }]);
    expect(r.dropped).toHaveLength(1);
    expect(r.brand).toBe("Flyttgo"); // as the page writes it
    expect(JSON.parse(renderSiteRequest({ url: "u", title: null, text: "x".repeat(SITE_TEXT_MAX + 50) })).pageText).toHaveLength(SITE_TEXT_MAX);
    expect(roleOfPrompt(PROMPTS.siteAnalysis.id)?.id).toBe("director");
  });

  it("reads a stored ad source defensively", () => {
    expect(adSourceOf(null)).toBeNull();
    expect(adSourceOf({ url: "https://a.example", facts: [{ kind: "benefit", statement: "s", quote: "q q q" }, { kind: "x", statement: "s", quote: "q" }, "junk"] }))
      .toEqual({ url: "https://a.example", title: null, brand: null, fetchedAt: null, facts: [{ kind: "benefit", statement: "s", quote: "q q q" }] });
  });
});

describe("advert claim checks (A2: the Director flags unsupported claims)", () => {
  it("finds numbers, superlatives and guarantees in a sentence", () => {
    expect(claimTerms("Keep 85% of every fare.")).toEqual(["85", "%"]);
    expect(claimTerms("The fastest way to move, guaranteed.")).toEqual(["fastest", "guaranteed"]);
    expect(claimTerms("Only $9 a month.")).toEqual(["9"]);
    expect(claimTerms("We are the #1 choice.")).toEqual(["1", "#1"]);
    expect(claimTerms("Drive. Deliver. Earn.")).toEqual([]);
    expect(claimTerms("An honest forest interest.")).toEqual([]); // -est words are not superlatives
  });

  it("flags narration and dialogue that claim more than the fact quotes state", () => {
    const pkg = fixturePackage();
    const s0 = pkg.scenes[0]!;
    const s1 = pkg.scenes[1]!;
    s0.narration = "Drivers keep 85% of every fare. It is the best job in the city.";
    s0.dialogue = [{ ...s0.dialogue[0]!, line: "Guaranteed money, every week. 24/7 support." }];
    s1.narration = "Drive. Deliver. Earn.";
    s1.dialogue = [];
    const facts = [{ kind: "benefit" as const, statement: "Drivers keep most of each fare.", quote: "Drivers keep 85% of every job’s fare." }];
    const out = claimAdvisories(pkg, facts);
    expect(out.map((a) => [a.sceneId, a.source, a.unsupported])).toEqual([
      [s0.id, "narration", ["best"]],
      [s0.id, { dialogue: 0 }, ["guaranteed"]],
      [s0.id, { dialogue: 0 }, ["24", "7"]],
    ]);
    // With no facts at all, every claim is unsupported.
    expect(claimAdvisories(pkg, []).find((a) => a.source === "narration")!.unsupported).toEqual(["85", "%"]);
  });

  it("knows which shots show the photographed product", () => {
    const pkg = fixturePackage();
    expect(productShots(pkg)).toEqual([]);
    pkg.scenes[1]!.shots[0]!.subjectIds.push(PRODUCT_PROP_ID);
    expect(productShots(pkg)).toEqual([{ sceneIndex: pkg.scenes[1]!.index, shotIndex: pkg.scenes[1]!.shots[0]!.index }]);
  });
});

describe("the advert's SOURCE FACTS and BRAND ASSETS in the plan request", () => {
  const base = { format: "Advert", medium: "live_action" as const, style: null, narrated: false, direction: ["The last scene is the call to action."] };
  it("lists the facts with their quotes and the supplied brand files", () => {
    const r = renderPlanRequest("A 15-second advert.", C, {
      ...base,
      advert: { sourceUrl: "https://flyttgo.example/", facts: [{ kind: "call_to_action", statement: "Sign up.", quote: "Sign up in minutes" }], productPhotos: 2, logo: true },
    });
    expect(r).toContain("SOURCE FACTS (hard: the only claims the advert may make about the product; read from https://flyttgo.example/)");
    expect(r).toContain('- call to action: Sign up. — the page says: "Sign up in minutes"');
    expect(r).toContain(`- 2 product photograph(s): the product is the prop ${PRODUCT_PROP_ID}`);
    expect(r).toContain("the advertiser's logo");
  });
  it("without facts, forbids specific claims", () => {
    const r = renderPlanRequest("A 15-second advert.", C, { ...base, advert: { sourceUrl: null, facts: [], productPhotos: 0, logo: false } });
    expect(r).toContain("SOURCE FACTS: none were supplied");
    expect(r).not.toContain("BRAND ASSETS");
  });
});
