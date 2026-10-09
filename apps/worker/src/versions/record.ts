/**
 * Append-only media versions (DirectorOS W8; media_versions, migration 0029).
 *
 * Every accepted clip, scene voice track and finished master becomes an
 * immutable version row: what was stored, its hash and length, and how it was
 * made. A shot's `video_key` (or a film's `mp4_key`) is only the pointer to
 * the current version; regenerating, a canon edit or a re-render adds a
 * version and never erases the history. Storage keys are unique per
 * generation, so an old version's file is never overwritten.
 */
import { isMissingTable } from "../timeline/store";

export type VersionedAsset = "video" | "audio" | "image" | "subtitle" | "master";

export interface VersionInput {
  projectId: string;
  assetType: VersionedAsset;
  /** The logical asset: a shot, a scene (voice track), the project (master). */
  assetId: string;
  storageKey: string;
  sha256?: string | null;
  durationSec?: number | null;
  /** How it was made: role, model, seed, attempt, gate outcome, canon version… */
  derivation: Record<string, unknown>;
  derivedFrom?: string[];
}

export interface VersionDb {
  mediaVersion: {
    findFirst(a: { where: Record<string, unknown>; orderBy: Record<string, unknown>; select: { version: true; storageKey?: true } }): Promise<{ version: number; storageKey?: string } | null>;
    create(a: { data: Record<string, unknown>; select: { id: true; version: true } }): Promise<{ id: string; version: number }>;
  };
}

let tableMissing = false;

/** The version the next write will get (1 when there is none). Used to name a versioned master path. */
export async function nextVersion(db: VersionDb, assetType: VersionedAsset, assetId: string): Promise<number> {
  if (tableMissing) return 1;
  try {
    const last = await db.mediaVersion.findFirst({ where: { assetType, assetId }, orderBy: { version: "desc" }, select: { version: true } });
    return (last?.version ?? 0) + 1;
  } catch (e) {
    if (isMissingTable(e)) tableMissing = true;
    return 1;
  }
}

const isConflict = (e: unknown) => (e as { code?: string })?.code === "P2002";

/**
 * Record a version. Idempotent for a retried job: the same storage key as the
 * latest version is not recorded twice. Never throws — the media itself is
 * already stored; a missing table or a write error is logged once.
 */
export async function recordVersion(db: VersionDb, v: VersionInput): Promise<{ id: string; version: number } | null> {
  if (tableMissing) return null;
  try {
    for (let tries = 0; tries < 3; tries++) {
      const last = await db.mediaVersion.findFirst({
        where: { assetType: v.assetType, assetId: v.assetId }, orderBy: { version: "desc" }, select: { version: true, storageKey: true },
      });
      if (last && last.storageKey === v.storageKey) return null;
      try {
        return await db.mediaVersion.create({
          data: {
            projectId: v.projectId, assetType: v.assetType, assetId: v.assetId, version: (last?.version ?? 0) + 1,
            storageKey: v.storageKey,
            sha256: v.sha256 && /^[0-9a-f]{64}$/.test(v.sha256) ? v.sha256 : null,
            durationUs: v.durationSec != null && Number.isFinite(v.durationSec) ? BigInt(Math.round(v.durationSec * 1e6)) : null,
            derivedFrom: v.derivedFrom ?? [],
            derivation: v.derivation,
          },
          select: { id: true, version: true },
        });
      } catch (e) {
        if (!isConflict(e)) throw e; // a concurrent writer took that number: read again
      }
    }
    throw new Error("could not allocate a version number");
  } catch (e) {
    if (isMissingTable(e)) {
      tableMissing = true;
      console.warn('{"event":"media.version","note":"media_versions not migrated (0029); versions not recorded until restart"}');
    } else {
      console.error(JSON.stringify({ event: "media.version", assetType: v.assetType, assetId: v.assetId, error: e instanceof Error ? e.message : String(e) }));
    }
    return null;
  }
}

/** Test hook. */
export function _resetVersionState(): void {
  tableMissing = false;
}
