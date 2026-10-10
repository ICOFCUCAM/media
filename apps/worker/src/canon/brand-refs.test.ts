import { beforeEach, describe, expect, it } from "vitest";
import { fixturePackage, PRODUCT_PROP_ID } from "@cineforge/movie";
import {
  _resetBrandState, ADVERT_CARD_COLOR, brandPlanGaps, brandSeedGaps, loadBrandAssets, logoOf, outroFor, productReferenceKeys, type BrandAsset, type BrandDb,
} from "./brand-refs";

const logo: BrandAsset = { id: "a1", role: "logo", storageKey: "brand/u1/logo.png", name: "logo.png", mime: "image/png" };
const p1: BrandAsset = { id: "a2", role: "product", storageKey: "brand/u1/p1.jpg", name: "flask.jpg", mime: "image/jpeg" };
const p2: BrandAsset = { id: "a3", role: "product", storageKey: "brand/u1/p2.jpg", name: "flask-side.jpg", mime: "image/jpeg" };

function withProduct() {
  const pkg = fixturePackage();
  const sc = pkg.scenes[1]!;
  sc.shots[0]!.subjectIds.push(PRODUCT_PROP_ID);
  return { pkg, sc };
}

describe("the advertiser's files in production (Ads Studio A3)", () => {
  beforeEach(() => _resetBrandState());

  it("reads the project's files, and none before migration 0060", async () => {
    const db: BrandDb = { brandAsset: { findMany: async () => [{ ...logo }, { ...p1 }, { id: "x", role: "video", storageKey: "k", name: "", mime: "" }] } };
    expect((await loadBrandAssets(db, "p")).map((a) => a.id)).toEqual(["a1", "a2"]);
    const missing: BrandDb = { brandAsset: { findMany: async () => { throw Object.assign(new Error("relation \"brand_assets\" does not exist"), { code: "P2021" }); } } };
    expect(await loadBrandAssets(missing, "p")).toEqual([]);
    expect(logoOf([p1, logo])).toBe(logo);
  });

  it("draws only the shots that show the product from the product photographs", () => {
    const { pkg, sc } = withProduct();
    expect(productReferenceKeys([logo, p1, p2], pkg, sc.index, sc.shots[0]!.index)).toEqual([p1.storageKey, p2.storageKey]);
    expect(productReferenceKeys([logo, p1, p2], pkg, pkg.scenes[0]!.index, 0)).toEqual([]);
    expect(productReferenceKeys([logo], pkg, sc.index, sc.shots[0]!.index)).toEqual([]);
    expect(productReferenceKeys([p1], null, sc.index, 0)).toEqual([]);
  });

  it("records product photographs the plan cannot use", () => {
    const { pkg } = withProduct();
    expect(brandPlanGaps([logo, p1], pkg, true)).toEqual([]);
    expect(brandPlanGaps([logo], fixturePackage(), true)).toEqual([]); // a logo alone needs no product shot
    const none = brandPlanGaps([p1], fixturePackage(), true);
    expect(none).toEqual([expect.objectContaining({ code: "BRAND_ASSET_UNUSED", scope: "project", detail: expect.objectContaining({ photos: ["flask.jpg"] }) })]);
    expect(none[0]!.message).toMatch(/does not show the product/);
    expect(brandPlanGaps([p1], pkg, false)[0]!.message).toMatch(/not drawn from stills/);
  });

  it("records a product shot whose still could not use the photographs", () => {
    expect(brandSeedGaps("s1", [p1.storageKey], { drawn: true, conditioned: true })).toEqual([]);
    expect(brandSeedGaps("s1", [], { drawn: false, conditioned: false })).toEqual([]);
    expect(brandSeedGaps("s1", [p1.storageKey], { drawn: true, conditioned: false, reason: "openai-image draws from text only" })[0])
      .toMatchObject({ code: "BRAND_ASSET_UNUSED", scope: "shot", refId: "s1", message: expect.stringMatching(/drawn from text only/) });
    expect(brandSeedGaps("s1", [p1.storageKey], { drawn: false, conditioned: false })[0]!.message).toMatch(/has no still/);
  });

  it("closes an advert on the advertiser's logo with the page's call to action, else the brand kit", () => {
    const kit = { logoKey: "kits/u1/logo.png", primaryColor: "#ff0000", outroText: "Agency line" };
    expect(outroFor(null, logo, "Sign up in minutes")).toEqual({ logoKey: logo.storageKey, primaryColor: ADVERT_CARD_COLOR, outroText: "Sign up in minutes" });
    expect(outroFor(kit, logo, null)).toEqual({ logoKey: logo.storageKey, primaryColor: "#ff0000", outroText: "Agency line" });
    expect(outroFor(kit, null, "Sign up")).toEqual(kit);
    expect(outroFor(null, null, "Sign up")).toBeUndefined();
  });
});
