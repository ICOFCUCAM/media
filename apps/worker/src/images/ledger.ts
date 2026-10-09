/**
 * The Image Engine's record (DirectorOS Part 2 §69; W17; migration 0052): one
 * image_generations row per still — what made it (provider, model, seed), what
 * was asked (prompt sha256, size), what came out (stored key, sha256) and the
 * canon it depicts. Best effort: a still that was generated is never thrown
 * away because the record could not be written (logged instead).
 */
import type { GeneratedImage } from "./providers";
import { isMissingTable } from "../timeline/store";

export type ImagePurpose = "seed_frame" | "seed_candidate" | "wardrobe_reference" | "location_reference" | "prop_reference";

export interface ImageLedgerDb {
  imageGeneration: { create(a: { data: Record<string, unknown>; select?: Record<string, unknown> }): Promise<unknown> };
}

let tableMissing = false;
/** Test hook. */
export function _resetImageLedgerState(): void {
  tableMissing = false;
}

export function imageGenerationRow(
  projectId: string,
  purpose: ImagePurpose,
  subject: string,
  img: GeneratedImage,
  extra: { canonDigest?: string | null; candidate?: number | null; chosen?: boolean | null } = {},
): Record<string, unknown> {
  return {
    projectId, purpose, subject: subject.slice(0, 128), provider: img.provider, model: img.model,
    seed: img.seed === null ? null : BigInt(img.seed), promptSha256: img.promptSha256, width: img.width, height: img.height,
    storageKey: img.key, sha256: img.sha256, canonDigest: extra.canonDigest ?? null,
    candidate: purpose === "seed_candidate" ? (extra.candidate ?? 0) : null,
    chosen: purpose === "seed_candidate" ? (extra.chosen ?? false) : null,
  };
}

export async function recordImageGeneration(db: ImageLedgerDb, row: Record<string, unknown>): Promise<"recorded" | "skipped"> {
  if (tableMissing) return "skipped";
  try {
    await db.imageGeneration.create({ data: row, select: { id: true } });
    return "recorded";
  } catch (e) {
    if (isMissingTable(e)) { tableMissing = true; return "skipped"; }
    console.warn(JSON.stringify({ event: "image.ledger", subject: row.subject, error: e instanceof Error ? e.message : String(e) }));
    return "skipped";
  }
}
