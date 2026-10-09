import { beforeEach, describe, expect, it } from "vitest";
import { _resetVersionState, nextVersion, recordVersion, type VersionDb } from "./record";

function fakeDb(opts: { conflictOnce?: boolean; missing?: boolean } = {}) {
  const rows: { version: number; storageKey: string; data: Record<string, unknown> }[] = [];
  let conflict = opts.conflictOnce ?? false;
  const db: VersionDb = {
    mediaVersion: {
      findFirst: async () => {
        if (opts.missing) throw Object.assign(new Error("relation media_versions does not exist"), { code: "P2021" });
        const last = rows.at(-1);
        return last ? { version: last.version, storageKey: last.storageKey } : null;
      },
      create: async ({ data }) => {
        if (conflict) {
          conflict = false;
          rows.push({ version: data.version as number, storageKey: "someone-else", data }); // a concurrent writer
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
        rows.push({ version: data.version as number, storageKey: data.storageKey as string, data });
        return { id: `v${data.version}`, version: data.version as number };
      },
    },
  };
  return { db, rows };
}

const base = { projectId: "p", assetType: "video" as const, assetId: "shot-1", derivation: { role: "clip" } };

describe("media versions (W8)", () => {
  beforeEach(() => _resetVersionState());

  it("appends versions 1, 2, 3 with hash and length; never rewrites", async () => {
    const { db, rows } = fakeDb();
    await recordVersion(db, { ...base, storageKey: "a.mp4", sha256: "f".repeat(64), durationSec: 4.25 });
    await recordVersion(db, { ...base, storageKey: "b.mp4" });
    expect(await nextVersion(db, "video", "shot-1")).toBe(3);
    expect(rows.map((r) => [r.version, r.storageKey])).toEqual([[1, "a.mp4"], [2, "b.mp4"]]);
    expect(rows[0]!.data).toMatchObject({ sha256: "f".repeat(64), durationUs: 4_250_000n, derivedFrom: [], derivation: { role: "clip" } });
  });

  it("a retried job does not record the same file twice", async () => {
    const { db, rows } = fakeDb();
    await recordVersion(db, { ...base, storageKey: "a.mp4" });
    expect(await recordVersion(db, { ...base, storageKey: "a.mp4" })).toBeNull();
    expect(rows).toHaveLength(1);
  });

  it("takes the next number when a concurrent writer won the race", async () => {
    const { db, rows } = fakeDb({ conflictOnce: true });
    expect(await recordVersion(db, { ...base, storageKey: "a.mp4" })).toEqual({ id: "v2", version: 2 });
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
  });

  it("drops a malformed hash and never throws when the table is missing", async () => {
    const { db, rows } = fakeDb();
    await recordVersion(db, { ...base, storageKey: "a.mp4", sha256: "not-a-hash" });
    expect(rows[0]!.data.sha256).toBeNull();
    const missing = fakeDb({ missing: true });
    expect(await recordVersion(missing.db, { ...base, storageKey: "a.mp4" })).toBeNull();
    expect(await nextVersion(missing.db, "master", "p")).toBe(1);
  });
});
