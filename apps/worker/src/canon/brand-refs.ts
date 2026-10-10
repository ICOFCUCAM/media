/**
 * The advertiser's own files in production (Ads Studio A3; docs/47,
 * migration 0060). An advert from the Ads Studio may carry:
 *
 *   logo     added exactly as supplied on the closing card (render/profile.ts
 *            brandOutro → the render engine's outro card); never redrawn.
 *   product  photographs of the product. The Director plans the product as
 *            the prop `prop_product`; every shot that shows it has its still
 *            drawn from these photographs (seed-still references), and the
 *            video model gets them in the reference pack.
 *
 * When a file cannot be used — the plan never shows the product, the shots
 * have no stills, the image provider draws from text only — that is recorded
 * as BRAND_ASSET_UNUSED, never passed over in silence.
 */
import { degradation, type Degradation } from "@cineforge/shared";
import { PRODUCT_PROP_ID, productShots, type FilmPackage } from "@cineforge/movie";
import { isMissingTable } from "../timeline/store";

export interface BrandAsset {
  id: string;
  role: "logo" | "product";
  storageKey: string;
  name: string;
  mime: string;
}

export interface BrandDb {
  brandAsset: {
    findMany(args: { where: { projectId: string }; orderBy: { createdAt: "asc" }; select: Record<string, true> }): Promise<{ id: string; role: string; storageKey: string; name: string; mime: string }[]>;
  };
}

let tableMissing = false;
/** Test hook. */
export function _resetBrandState(): void {
  tableMissing = false;
}

/** The project's brand files, oldest first (none before migration 0060). */
export async function loadBrandAssets(db: BrandDb, projectId: string): Promise<BrandAsset[]> {
  if (tableMissing) return [];
  try {
    const rows = await db.brandAsset.findMany({
      where: { projectId }, orderBy: { createdAt: "asc" }, select: { id: true, role: true, storageKey: true, name: true, mime: true },
    });
    return rows.filter((r): r is BrandAsset => r.role === "logo" || r.role === "product");
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    tableMissing = true;
    return [];
  }
}

export const logoOf = (assets: BrandAsset[]): BrandAsset | null => assets.find((a) => a.role === "logo") ?? null;
export const productPhotos = (assets: BrandAsset[]): BrandAsset[] => assets.filter((a) => a.role === "product");

/** The product photographs a shot is drawn from: all of them when the shot shows prop_product, else none (pure). */
export function productReferenceKeys(assets: BrandAsset[], pkg: Pick<FilmPackage, "scenes"> | null, sceneIndex: number, shotIndex: number): string[] {
  const photos = productPhotos(assets);
  if (!photos.length || !pkg) return [];
  const shot = pkg.scenes.find((s) => s.index === sceneIndex)?.shots.find((s) => s.index === shotIndex);
  return shot?.subjectIds.includes(PRODUCT_PROP_ID) ? photos.map((p) => p.storageKey) : [];
}

/**
 * What the plan means for the brand files (pure): product photographs the plan
 * never shows, or that no shot can use because shots are not drawn from stills.
 */
export function brandPlanGaps(assets: BrandAsset[], pkg: Pick<FilmPackage, "scenes">, seedStills: boolean): Degradation[] {
  const photos = productPhotos(assets);
  if (!photos.length) return [];
  const detail = { photos: photos.map((p) => p.name || p.storageKey) };
  if (!seedStills) {
    return [degradation("BRAND_ASSET_UNUSED", "project",
      "Your product photographs were not used: this production's shots are not drawn from stills (no image provider is configured).",
      { detail: { ...detail, reason: "no seed stills" } })];
  }
  if (!productShots(pkg).length) {
    return [degradation("BRAND_ASSET_UNUSED", "project",
      "Your product photographs were not used: the plan does not show the product in any shot.",
      { detail: { ...detail, reason: `no shot lists ${PRODUCT_PROP_ID}` } })];
  }
  return [];
}

/**
 * One product shot's still (pure): the photographs were sent to the image
 * provider; if no still was drawn, or it was drawn from text only, they were
 * not used for this shot.
 */
export function brandSeedGaps(
  shotId: string,
  productKeys: string[],
  outcome: { drawn: boolean; conditioned: boolean; reason?: string | null },
): Degradation[] {
  if (!productKeys.length || (outcome.drawn && outcome.conditioned)) return [];
  return [degradation("BRAND_ASSET_UNUSED", "shot",
    outcome.drawn
      ? "This product shot's still was drawn from text only; your product photographs could not be used by the image provider."
      : "This product shot has no still, so your product photographs could not be used for it.",
    { refId: shotId, detail: { photos: productKeys.length, reason: outcome.reason ?? null } })];
}

export interface OutroCard {
  logoKey?: string | null;
  primaryColor?: string;
  outroText?: string | null;
}

/** The card colour behind an advertiser's logo when they have no brand kit. */
export const ADVERT_CARD_COLOR = "#111111";

/**
 * The closing card (pure). An advert with the advertiser's logo closes on it,
 * exactly as supplied, with the page's own call to action as the line (a quote
 * from the page, so it claims nothing the page does not); otherwise the owner's
 * white-label brand kit, when their plan has one (docs/33).
 */
export function outroFor(kit: OutroCard | null, advertLogo: BrandAsset | null, callToAction: string | null): OutroCard | undefined {
  if (advertLogo) {
    return { logoKey: advertLogo.storageKey, primaryColor: kit?.primaryColor ?? ADVERT_CARD_COLOR, outroText: callToAction ?? kit?.outroText ?? null };
  }
  return kit ?? undefined;
}
