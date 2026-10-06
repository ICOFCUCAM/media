/**
 * The sync_policies seed in migration 0030 must equal the TypeScript defaults —
 * one source of truth for the starting tolerances.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_SYNC_POLICIES, PRODUCTION_PROFILES, syncPolicyToJson } from "./policy";

const SQL = readFileSync(fileURLToPath(new URL("../../../db/supabase/migrations/0030_av_sync.sql", import.meta.url)), "utf8");

describe("migration 0030 seed", () => {
  it("matches DEFAULT_SYNC_POLICIES exactly", () => {
    const rows = [...SQL.matchAll(/^ {2}\('([a-z]+)', (\d+), '([^']+)', '([^']+)', '([^']+)', (true|false)\)[,;]$/gm)];
    expect(rows.map((r) => r[1]).sort()).toEqual([...PRODUCTION_PROFILES].sort());
    for (const r of rows) {
      const expected = syncPolicyToJson(DEFAULT_SYNC_POLICIES[r[1] as keyof typeof DEFAULT_SYNC_POLICIES]);
      expect({
        id: r[1],
        version: Number(r[2]),
        tolerances: JSON.parse(r[3]!),
        repair: JSON.parse(r[4]!),
        delivery: JSON.parse(r[5]!),
        calibrated: r[6] === "true",
      }).toEqual(expected);
    }
  });
});
