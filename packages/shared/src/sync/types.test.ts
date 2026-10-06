import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SYNC_CHECKS, secs, severityFor } from "./types";

describe("sync vocabulary", () => {
  it("matches the av_sync_issues check list in migration 0030", () => {
    const sql = readFileSync(fileURLToPath(new URL("../../../db/supabase/migrations/0030_av_sync.sql", import.meta.url)), "utf8");
    const list = /"check"\s+text not null check \("check" in \(([^)]*)\)\)/.exec(sql)![1]!;
    expect([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])).toEqual([...SYNC_CHECKS]);
  });
  it("grades deviations against the tolerance", () => {
    expect(severityFor(40_000n, 42_000n)).toBeNull();
    expect(severityFor(-80_000n, 42_000n)).toBe("warning");
    expect(severityFor(150_000n, 42_000n)).toBe("error");
    expect(severityFor(1_200_000n, 42_000n)).toBe("blocker");
    expect(severityFor(1n, 0n)).toBe("error");
  });
  it("formats seconds for diagnostics", () => {
    expect(secs(6_833_333n)).toBe("6.833s");
    expect(secs(-420_000n)).toBe("-0.420s");
  });
});
