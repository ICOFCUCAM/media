import { describe, expect, it } from "vitest";
import { judgeReview } from "@cineforge/movie";
import { pickCandidate, seedCandidates } from "./candidates";
import { recordSeedCandidates, type MediaVersionDb } from "./record";
import { shotNodes } from "../orchestration/shot-nodes";

const review = (verdicts: { check: "wardrobe" | "identity"; status: "match" | "mismatch" | "cannot_tell" }[]) =>
  judgeReview({ verdicts: verdicts.map((v) => ({ ...v, subjectId: "char_maya", observation: "x" })) }, "anthropic", "m");

describe("seed candidates (W6)", () => {
  it("SEED_CANDIDATES is 1–4, default 1", () => {
    expect(seedCandidates({})).toBe(1);
    expect(seedCandidates({ SEED_CANDIDATES: "3" })).toBe(3);
    expect(seedCandidates({ SEED_CANDIDATES: "9" })).toBe(4);
    expect(seedCandidates({ SEED_CANDIDATES: "x" })).toBe(1);
  });

  it("picks a passing candidate over a failing one, then the one that matches most canon", () => {
    const wrongCoat = review([{ check: "wardrobe", status: "mismatch" }, { check: "identity", status: "match" }]);
    const unsure = review([{ check: "wardrobe", status: "match" }, { check: "identity", status: "cannot_tell" }]);
    const best = review([{ check: "wardrobe", status: "match" }, { check: "identity", status: "match" }]);
    expect(pickCandidate([{ key: "a", review: wrongCoat }, { key: "b", review: unsure }, { key: "c", review: best }])).toMatchObject({ index: 2, chosen: { key: "c" } });
    expect(pickCandidate([{ key: "a", review: wrongCoat }, { key: "b", review: unsure }]).index).toBe(1);
    // Without reviews the first is kept.
    expect(pickCandidate([{ key: "a", review: null }, { key: "b", review: null }]).index).toBe(0);
  });

  it("every candidate is recorded as a media version, the chosen one marked", async () => {
    const rows: Record<string, unknown>[] = [];
    const db: MediaVersionDb = {
      mediaVersion: { findFirst: async () => ({ version: 2 }), create: async (a) => { rows.push(a.data); return {}; } },
    };
    await recordSeedCandidates(db, "p", "shot-1", [{ key: "k1", review: null }, { key: "k2", review: null }], 1);
    expect(rows.map((r) => [r.version, r.storageKey, (r.derivation as { chosen: boolean }).chosen])).toEqual([[3, "k1", false], [4, "k2", true]]);
  });
});

describe("optional sequential shot edges (W6)", () => {
  const make = (id: string) => ({ name: "shot", queueName: "video", data: { shotId: id }, opts: {} });
  it("parallel by default; a chain with SEQUENTIAL_SHOTS — each shot waits for the one before it", () => {
    expect(shotNodes(["a", "b", "c"], make, false)).toHaveLength(3);
    const chain = shotNodes(["a", "b", "c"], make, true);
    expect(chain).toHaveLength(1);
    expect(chain[0]!.data.shotId).toBe("c");
    expect(chain[0]!.children![0]!.data.shotId).toBe("b");
    expect(chain[0]!.children![0]!.children![0]!.data.shotId).toBe("a");
    expect(chain[0]!.children![0]!.children![0]!.children).toBeUndefined();
  });
});
