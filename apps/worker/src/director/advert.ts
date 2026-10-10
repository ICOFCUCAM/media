/**
 * An advert from the Ads Studio in planning (A2/A3; docs/47): what the
 * Director is told — the advertiser's source facts and the brand files they
 * supplied — and what the plan is checked for afterwards: lines that claim
 * more than the facts support (CLAIM_UNSUPPORTED) and product photographs the
 * plan cannot use (BRAND_ASSET_UNUSED). Both are advisories on a valid plan,
 * recorded and shown to the owner; neither rewrites the film.
 */
import { degradation, type Degradation, type ProductionSpec } from "@cineforge/shared";
import { claimAdvisories, type AdSource, type FilmPackage, type PlanAdvert } from "@cineforge/movie";
import { brandPlanGaps, logoOf, productPhotos, type BrandAsset } from "../canon/brand-refs";

/** The ADVERT part of the plan request; null for any other format (pure). */
export function planAdvertFor(spec: Pick<ProductionSpec, "kind">, source: AdSource | null, assets: BrandAsset[]): PlanAdvert | null {
  if (spec.kind !== "advert") return null;
  return { sourceUrl: source?.url ?? null, facts: source?.facts ?? [], productPhotos: productPhotos(assets).length, logo: logoOf(assets) !== null };
}

const where = (source: "narration" | { dialogue: number }) => (source === "narration" ? "narration" : `line ${source.dialogue + 1}`);

/** Advisories on an advert's plan (pure): unsupported claims, then unusable product photographs. */
export function advertPlanDegradations(
  pkg: Pick<FilmPackage, "scenes">,
  source: AdSource | null,
  assets: BrandAsset[],
  seedStills: boolean,
): Degradation[] {
  const facts = source?.facts ?? [];
  const claims = claimAdvisories(pkg, facts).map((a) =>
    degradation("CLAIM_UNSUPPORTED", "scene",
      `Scene ${a.sceneIndex + 1} (${where(a.source)}): "${a.sentence.slice(0, 160)}" states ${a.unsupported.map((t) => `"${t}"`).join(", ")}, which ${facts.length ? "no source fact from the page supports" : "no source fact supports (no page was analysed)"}.`.slice(0, 500),
      { refId: a.sceneId, detail: { sentence: a.sentence, unsupported: a.unsupported, line: a.source, facts: facts.length } }));
  return [...claims, ...brandPlanGaps(assets, pkg, seedStills)];
}
