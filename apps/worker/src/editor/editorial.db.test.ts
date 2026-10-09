/**
 * The Editor's apply against a real PostgreSQL through the real Prisma client
 * (W13; Part 1 §21.3). Runs when DB_INTEGRATION=1 (see canon/revision.db.test.ts
 * for the setup). It plans a film as production does, marks every shot READY
 * with media, approves four edits, applies them, and checks the rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@cineforge/db";
import { canonVersion, FilmPackage, fixturePackage } from "@cineforge/movie";
import { persistPlan } from "../director/director.service";
import { applyEditorialReview } from "./editorial";

const RUN = process.env.DB_INTEGRATION === "1";
let projectId = "";
let userId = "";

async function reviewWith(ops: object[], status: "apply_requested" | "ready" = "apply_requested", version?: string) {
  const pkg = FilmPackage.parse(((await prisma.screenplay.findUniqueOrThrow({ where: { projectId } })).raw as { package: unknown }).package);
  const review = await prisma.editorialReview.create({
    data: { projectId, requestedBy: userId, status, canonVersion: version ?? canonVersion(pkg), summary: "test" },
    select: { id: true },
  });
  for (const [i, op] of ops.entries()) {
    await prisma.editProposal.create({ data: { reviewId: review.id, projectId, position: i, op, description: `op ${i}`, status: "approved" } });
  }
  return review.id;
}

describe.runIf(RUN)("the Editor's apply on a real database (W13)", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `ed-${Date.now()}@cineforge.test` }, select: { id: true } });
    userId = user.id;
    const project = await prisma.project.create({
      data: { userId, title: "Harbour Run", prompt: "a courier crosses a harbour", targetSeconds: 36, modelId: "wan-2.1" },
      select: { id: true, modelId: true, resolution: true, aspectRatio: true },
    });
    projectId = project.id;
    await persistPlan(projectId, project, { pkg: fixturePackage(), revised: false, fixedIssues: [], provider: "test", model: "test" });
    for (const s of await prisma.shot.findMany({ where: { scene: { projectId } }, select: { id: true } })) {
      await prisma.shot.update({ where: { id: s.id }, data: { status: "READY", videoKey: `clips/${s.id}.mp4`, attempts: 1 } });
    }
    const scene2 = await prisma.scene.findFirstOrThrow({ where: { projectId, index: 1 }, select: { id: true } });
    await prisma.audioTrack.create({ data: { sceneId: scene2.id, kind: "VOICE", key: "voice/s2.wav", durationMs: 3000 } });
  }, 60_000);

  afterAll(async () => {
    if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("applies approved edits together: re-cuts keep their clips, the cut shot goes, the insert waits to generate, the scene re-voices", async () => {
    const before = await prisma.shot.findMany({ where: { scene: { projectId } }, select: { id: true, index: true, videoKey: true, scene: { select: { index: true } } } });
    const at = (si: number, hi: number) => before.find((s) => s.scene.index === si && s.index === hi)!;
    const id = await reviewWith([
      { op: "TRIM_SHOT", sceneId: "scene_01", shotIndex: 0, toSec: 3, reason: "faster" },
      { op: "CUT_SHOT", sceneId: "scene_01", shotIndex: 2, reason: "redundant" },
      { op: "ADD_INSERT", sceneId: "scene_02", afterShotIndex: 0, subjectId: "prop_key", action: "The key glints.", durationSec: 2, reason: "clarity" },
      { op: "REMOVE_LINE", sceneId: "scene_02", lineIndex: 0, reason: "repeats" },
    ]);
    const out = await applyEditorialReview(prisma, id);
    expect(out).toMatchObject({ outcome: "applied", regenerate: 1, removed: 1, revoiced: 1 });

    const s1 = await prisma.shot.findMany({ where: { scene: { projectId, index: 0 } }, orderBy: { index: "asc" }, select: { id: true, index: true, videoKey: true, status: true, durationSec: true, cutSec: true } });
    expect(s1.map((s) => s.id)).toEqual([at(0, 0).id, at(0, 1).id, at(0, 3).id]);
    expect(s1[0]).toMatchObject({ status: "READY", videoKey: at(0, 0).videoKey, durationSec: 3 });
    expect(Number(s1[0]!.cutSec)).toBe(3);
    expect(s1[2]).toMatchObject({ index: 2, status: "READY", videoKey: at(0, 3).videoKey });
    expect(await prisma.shot.findUnique({ where: { id: at(0, 2).id } })).toBeNull();

    const s2 = await prisma.shot.findMany({ where: { scene: { projectId, index: 1 } }, orderBy: { index: "asc" }, select: { id: true, status: true, videoKey: true } });
    expect(s2).toHaveLength(5);
    expect(s2[1]).toMatchObject({ status: "PENDING", videoKey: null });
    expect(s2[2]!.id).toBe(at(1, 1).id);
    const scene2 = await prisma.scene.findFirstOrThrow({ where: { projectId, index: 1 }, select: { id: true, dialogueLines: true, audioTracks: true } });
    expect(scene2.dialogueLines).toHaveLength(0);
    expect(scene2.audioTracks.filter((t) => t.kind === "VOICE")).toHaveLength(0);

    const review = await prisma.editorialReview.findUniqueOrThrow({ where: { id }, include: { proposals: true } });
    expect(review.status).toBe("applied");
    expect(review.proposals.every((p) => p.status === "applied")).toBe(true);
    const raw = (await prisma.screenplay.findUniqueOrThrow({ where: { projectId } })).raw as { canonVersion: string; editedBy: string; package: unknown };
    expect(raw.editedBy).toBe(id);
    expect(raw.canonVersion).toBe(review.appliedVersion);
    expect(FilmPackage.parse(raw.package).scenes[0]!.shots).toHaveLength(3);
    expect(await prisma.sceneVersion.count({ where: { projectId, reason: "editorial" } })).toBe(2);
  });

  it("a review of an earlier cut is refused: its numbers no longer mean the same shots", async () => {
    const id = await reviewWith([{ op: "CUT_SHOT", sceneId: "scene_02", shotIndex: 1, reason: "x" }], "apply_requested", "stale-version");
    const out = await applyEditorialReview(prisma, id);
    expect(out).toMatchObject({ outcome: "failed", error: expect.stringMatching(/changed after this review/) });
    expect((await prisma.editorialReview.findUniqueOrThrow({ where: { id } })).status).toBe("failed");
  });

  it("a locked scene is never edited", async () => {
    await prisma.scene.updateMany({ where: { projectId, index: 0 }, data: { lockedAt: new Date() } });
    const id = await reviewWith([{ op: "TRIM_SHOT", sceneId: "scene_01", shotIndex: 1, toSec: 4, reason: "x" }]);
    const out = await applyEditorialReview(prisma, id);
    expect(out).toMatchObject({ outcome: "failed", error: expect.stringMatching(/scene_01 is locked/) });
    await prisma.scene.updateMany({ where: { projectId, index: 0 }, data: { lockedAt: null } });
  });
});
