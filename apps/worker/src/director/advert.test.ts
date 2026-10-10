import { describe, expect, it } from "vitest";
import { fixturePackage, FIXTURE_CONSTRAINTS, PRODUCT_PROP_ID, renderPlanRequest, type AdSource } from "@cineforge/movie";
import { productionOf, planProductionFor } from "./production";
import { advertPlanDegradations, planAdvertFor } from "./advert";
import type { BrandAsset } from "../canon/brand-refs";

const source: AdSource = {
  url: "https://flyttgo.example/", title: "Flyttgo", brand: "Flyttgo", fetchedAt: "2026-10-10T12:00:00Z",
  facts: [
    { kind: "benefit", statement: "Drivers keep most of each fare.", quote: "Drivers keep 85% of every job’s fare." },
    { kind: "call_to_action", statement: "Sign up.", quote: "Sign up in minutes" },
  ],
};
const product: BrandAsset = { id: "a2", role: "product", storageKey: "brand/u1/p1.jpg", name: "van.jpg", mime: "image/jpeg" };
const logo: BrandAsset = { id: "a1", role: "logo", storageKey: "brand/u1/logo.png", name: "logo.png", mime: "image/png" };

describe("an Ads Studio advert in planning (A2/A3)", () => {
  const advert = productionOf({ kind: "advert" });

  it("the Director plans from the page's facts and the supplied files", () => {
    expect(planAdvertFor(productionOf({}), source, [product])).toBeNull();
    const a = planAdvertFor(advert, source, [logo, product])!;
    expect(a).toEqual({ sourceUrl: source.url, facts: source.facts, productPhotos: 1, logo: true });
    const text = renderPlanRequest("A 15-second advert for Flyttgo.", FIXTURE_CONSTRAINTS, planProductionFor(advert, undefined, a));
    expect(text).toContain('- benefit: Drivers keep most of each fare. — the page says: "Drivers keep 85% of every job’s fare."');
    expect(text).toContain(PRODUCT_PROP_ID);
    // An advert with nothing from the Ads Studio is still told to make no specific claims.
    expect(renderPlanRequest("An advert.", FIXTURE_CONSTRAINTS, planProductionFor(advert))).toContain("SOURCE FACTS: none were supplied");
  });

  it("flags lines the facts do not support and product photographs the plan never shows", () => {
    const pkg = fixturePackage();
    pkg.scenes[0]!.narration = "Keep 85% of every fare. The best way to earn, guaranteed.";
    const out = advertPlanDegradations(pkg, source, [product], true);
    expect(out.map((d) => d.code)).toEqual(["CLAIM_UNSUPPORTED", "BRAND_ASSET_UNUSED"]);
    expect(out[0]).toMatchObject({ scope: "scene", refId: pkg.scenes[0]!.id, detail: { unsupported: ["best", "guaranteed"] } });
    expect(out[0]!.message).toMatch(/^Scene 1 \(narration\): "The best way to earn, guaranteed\." states "best", "guaranteed", which no source fact from the page supports\.$/);
    expect(out[0]!.severity).toBe("warning");
    // No facts: the same numbers are unsupported too.
    expect(advertPlanDegradations(pkg, null, [], true).map((d) => d.detail?.unsupported)).toEqual([["85", "%"], ["best", "guaranteed"]]);
  });
});
