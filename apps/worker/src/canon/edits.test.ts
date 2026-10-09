import { describe, expect, it } from "vitest";
import { CanonChangeSchema, processEditRequest, type EditDeps } from "./edits";
import type { AppliedRevision } from "./revision";

const change = { kind: "scene_wardrobe", sceneId: "scene_12", characterId: "char_maya", wardrobe: { id: "wardrobe_blue_coat", description: "long blue wool coat" } };

function deps(result: AppliedRevision | Error, opts: { claimed?: boolean } = {}) {
  const log: string[] = [];
  const finished: Record<string, unknown>[] = [];
  const d: EditDeps = {
    claim: async () => opts.claimed ?? true,
    finish: async (_id, data) => { finished.push(data); },
    apply: async (_p, c, actor) => {
      log.push(`apply:${c.kind}:${actor}`);
      if (result instanceof Error) throw result;
      return result;
    },
    regenerate: async (_p, v) => { log.push(`regenerate:${v}`); },
  };
  return { d, log, finished };
}

const applied = (n: number): AppliedRevision => ({ outcome: "applied", issues: [], affectedScenes: ["scene_11"], invalidatedShotIds: Array.from({ length: n }, (_, i) => `s${i}`), fromVersion: "a", toVersion: "b" });
const req = { id: "e1", projectId: "p1", requestedBy: "u1", change };

describe("edit requests (W8b)", () => {
  it("applies the change as the requester and regenerates only when shots were invalidated", async () => {
    const one = deps(applied(2));
    expect(await processEditRequest(req, one.d)).toBe("applied");
    expect(one.log).toEqual(["apply:scene_wardrobe:user:u1", "regenerate:b"]);
    expect(one.finished).toEqual([{ status: "applied", issues: [], affectedShots: 2, toVersion: "b" }]);
    const none = deps(applied(0));
    await processEditRequest(req, none.d);
    expect(none.log).toEqual(["apply:scene_wardrobe:user:u1"]);
  });

  it("records a refusal (canon or lock) with its issues and regenerates nothing", async () => {
    const r = deps({ ...applied(0), outcome: "rejected", issues: [{ stage: "production", code: "SCENE_LOCKED", path: "scene_12", message: "scene_12 is locked" }] });
    expect(await processEditRequest(req, r.d)).toBe("rejected");
    expect(r.log).not.toContain("regenerate:b");
    expect(r.finished[0]).toMatchObject({ status: "rejected", issues: [{ code: "SCENE_LOCKED" }] });
  });

  it("refuses a malformed or unknown change before touching canon", async () => {
    const bad = deps(applied(1));
    expect(await processEditRequest({ ...req, change: { kind: "scene_wardrobe", sceneId: "12", characterId: "char_maya", wardrobe: { id: "x", description: "" } } }, bad.d)).toBe("failed");
    expect(bad.log).toEqual([]);
    expect(bad.finished[0]!.error).toMatch(/invalid change: sceneId must look like scene_…/);
    expect(CanonChangeSchema.safeParse({ kind: "delete_film" }).success).toBe(false);
    expect(CanonChangeSchema.safeParse({ ...change, extra: 1 }).success).toBe(false);
  });

  it("a film planned before the Film IR fails with the reason; a request another worker took is skipped", async () => {
    const old = deps(new Error("project p1 has no Film IR"));
    expect(await processEditRequest(req, old.d)).toBe("failed");
    expect(old.finished[0]!.error).toMatch(/no Film IR/);
    const taken = deps(applied(1), { claimed: false });
    expect(await processEditRequest(req, taken.d)).toBe("skipped");
    expect(taken.log).toEqual([]);
  });
});
