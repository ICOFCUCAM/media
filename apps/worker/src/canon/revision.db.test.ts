/**
 * Canon revision against a real PostgreSQL through the real Prisma client
 * (DirectorOS Part 2 §62.9). Runs when DB_INTEGRATION=1 and DATABASE_URL
 * points at a scratch database with the Prisma schema pushed:
 *
 *   createdb cf_it && DATABASE_URL=… pnpm --filter @cineforge/db exec prisma db push --skip-generate
 *   DB_INTEGRATION=1 DATABASE_URL=… pnpm --filter @cineforge/worker exec vitest run src/canon/revision.db.test.ts
 *
 * It plans the Maya film exactly as production does (persistPlan), marks
 * every shot READY with media, changes Maya's coat, and checks the rows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@cineforge/db";
import { FilmPackage, mayaCoatFixture } from "@cineforge/movie";
import { persistPlan } from "../director/director.service";
import { applyCanonRevision, type CanonDb } from "./revision";
import { shotReferences } from "./references";
import { wardrobeReferenceKeys, type WardrobeRefDb } from "./wardrobe-refs";
import { checkContinuity } from "@cineforge/movie";

const RUN = process.env.DB_INTEGRATION === "1";
let projectId = "";

describe.runIf(RUN)("canon revision on a real database (§62.9)", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `it-${Date.now()}@cineforge.test` }, select: { id: true } });
    const project = await prisma.project.create({
      data: { userId: user.id, title: "Harbour Run", prompt: "a courier crosses a harbour", targetSeconds: 54, modelId: "wan-2.1" },
      select: { id: true, modelId: true, resolution: true, aspectRatio: true },
    });
    projectId = project.id;
    await persistPlan(projectId, project, { pkg: mayaCoatFixture(), revised: false, fixedIssues: [], provider: "test", model: "test" });
    const shots = await prisma.shot.findMany({ where: { scene: { projectId } }, select: { id: true } });
    for (const s of shots) {
      await prisma.shot.update({ where: { id: s.id }, data: { status: "READY", videoKey: `clips/${s.id}.mp4`, thumbnailKey: `thumbs/${s.id}.jpg`, qcScore: 0.9, attempts: 1 } });
    }
  }, 60_000);

  afterAll(async () => {
    if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("re-keys and resets exactly the affected shots; everything else keeps its media", async () => {
    const before = await prisma.shot.findMany({
      where: { scene: { projectId } }, orderBy: [{ scene: { index: "asc" } }, { index: "asc" }],
      select: { id: true, index: true, prompt: true, cacheKey: true, videoKey: true, status: true, scene: { select: { index: true } } },
    });
    expect(before).toHaveLength(12);

    const r = await applyCanonRevision(prisma as unknown as CanonDb, projectId, {
      kind: "scene_wardrobe", sceneId: "scene_12", characterId: "char_maya",
      wardrobe: { id: "wardrobe_blue_coat", description: "long blue wool coat" },
    }, { actor: "test:db" });
    expect(r.outcome).toBe("applied");
    expect(r.affectedScenes).toEqual(["scene_11", "scene_12"]);

    const after = await prisma.shot.findMany({
      where: { scene: { projectId } }, orderBy: [{ scene: { index: "asc" } }, { index: "asc" }],
      select: { id: true, prompt: true, cacheKey: true, videoKey: true, thumbnailKey: true, status: true, attempts: true, qcScore: true },
    });
    const changed = after.filter((s) => r.invalidatedShotIds.includes(s.id));
    expect(changed.map((s) => before.find((b) => b.id === s.id)!).map((b) => `${b.scene.index}#${b.index}`)).toEqual(["1#1", "2#1"]);
    for (const s of after) {
      const b = before.find((x) => x.id === s.id)!;
      if (r.invalidatedShotIds.includes(s.id)) {
        expect(s).toMatchObject({ status: "PENDING", videoKey: null, thumbnailKey: null, attempts: 0, qcScore: null });
        expect(s.prompt).toContain("wearing long blue wool coat");
        expect(s.cacheKey).not.toBe(b.cacheKey);
      } else {
        expect(s).toMatchObject({ status: "READY", videoKey: b.videoKey, cacheKey: b.cacheKey, prompt: b.prompt });
      }
    }

    const scene = await prisma.scene.findFirstOrThrow({ where: { projectId, index: 1 }, select: { statePatch: true } });
    expect((scene.statePatch as { characters: Record<string, Record<string, string>> }).characters.Maya).toMatchObject({ key: "char_maya", wardrobe: "long blue wool coat" });
    const sp = await prisma.screenplay.findUniqueOrThrow({ where: { projectId }, select: { raw: true } });
    const raw = sp.raw as { canonVersion: string; revisedFrom: string; package: unknown; plan: { provider: string } };
    expect(raw).toMatchObject({ canonVersion: r.toVersion, revisedFrom: r.fromVersion, plan: { provider: "test" } });
    expect(FilmPackage.parse(raw.package).scenes[1]!.characters[0]!.wardrobeId).toBe("wardrobe_blue_coat");
    const rows = await prisma.canonRevision.findMany({ where: { projectId } });
    expect(rows).toEqual([expect.objectContaining({ kind: "scene_wardrobe", outcome: "applied", invalidated: 2, actor: "test:db" })]);
  });

  it("references and the wardrobe pack resolve from the persisted rows", async () => {
    const sp = await prisma.screenplay.findUniqueOrThrow({ where: { projectId }, select: { raw: true } });
    const pkg = FilmPackage.parse((sp.raw as { package: unknown }).package);
    const scene = await prisma.scene.findFirstOrThrow({ where: { projectId, index: 2 }, select: { statePatch: true } });
    const chars = (scene.statePatch as { characters: Record<string, Record<string, string>> }).characters;
    const refs = shotReferences(pkg, 2, 1, chars);
    const maya = await prisma.character.findFirstOrThrow({ where: { projectId, name: "Maya" }, select: { id: true } });
    expect(refs.characterIds).toEqual([maya.id]);

    // Two shots racing for the same reference: one image row, both get a key.
    let generated = 0;
    const image = { id: "test-image", generate: async (_p: string, key: string) => { generated++; await new Promise((r) => setTimeout(r, 20)); return key; } };
    const result = checkContinuity(pkg, { sceneId: "scene_12", shotIndex: 1 });
    const [a, b] = await Promise.all([1, 2].map((n) =>
      wardrobeReferenceKeys(prisma as unknown as WardrobeRefDb, image, projectId, `shot-${n}`, pkg, result, refs.charIdByKey)));
    expect(a!.gaps).toEqual([]);
    expect(b!.gaps).toEqual([]);
    expect(a!.keys[0]).toMatch(/wardrobe_blue_coat-[0-9a-f]{16}\.png$/);
    expect(b!.keys).toEqual(a!.keys);
    expect(await prisma.wardrobeReference.count({ where: { projectId } })).toBe(1);
    expect(generated).toBeGreaterThanOrEqual(1);
  });
});
