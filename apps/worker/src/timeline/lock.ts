/**
 * Film lock → approved timeline → final render (DirectorOS W19; Part 1 §38,
 * §40.3). When the owner locks a finished film, the production timeline is
 * built from the locked scenes, saved and APPROVED (the database then freezes
 * its events), and the master is rendered from it: the timeline decides the
 * order of the shots and how long each one plays. Once delivered, the
 * timeline is FROZEN; earlier approved timelines are superseded. Unlocking
 * and locking again makes a new approved timeline and a new master.
 */
import { buildTimelineDraft, MasterClock, syncPolicy } from "@cineforge/shared";
import { isMissingTable, loadProjectSource, saveTimelineDraft, type TimelineDb } from "./store";

export interface LockDb extends TimelineDb {
  productionTimeline: TimelineDb["productionTimeline"] & {
    update(a: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
    updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
}

export type ApproveResult = { approved: true; timelineId: string; version: number } | { approved: false; reason: string };

/** Build, save and approve the locked film's timeline; supersede the approved ones before it. */
export async function approveLockedTimeline(db: LockDb, projectId: string, profile: string): Promise<ApproveResult> {
  const draft = buildTimelineDraft({ scenes: await loadProjectSource(db, projectId), clock: new MasterClock({ fps: "24" }) });
  if (!draft.events.some((e) => e.kind === "shot")) return { approved: false, reason: "the film has no shots" };
  const saved = await saveTimelineDraft(db, projectId, draft, syncPolicy(profile));
  if (!saved.saved) return { approved: false, reason: saved.reason };
  try {
    await db.productionTimeline.updateMany({ where: { projectId, status: "approved", id: { not: saved.timelineId } }, data: { status: "superseded" } });
    await db.productionTimeline.update({ where: { id: saved.timelineId }, data: { status: "approved" } });
  } catch (e) {
    if (isMissingTable(e)) return { approved: false, reason: "TABLES_MISSING" };
    throw e;
  }
  return { approved: true, timelineId: saved.timelineId, version: saved.version };
}


export interface TimelineCut {
  /** Scenes in timeline order, each with its shots in order and how long each plays. */
  scenes: { sceneId: string; shots: { shotId: string; sec: number }[] }[];
  durationSec: number;
}

/**
 * The cut an approved timeline prescribes (pure): scenes by their start, shots
 * by theirs within each scene, each shot for exactly its span.
 */
export function cutFromTimeline(events: { kind: string; refId: string | null; startUs: bigint; endUs: bigint }[], shotScene: Map<string, string>): TimelineCut {
  const sceneStart = new Map(events.filter((e) => e.kind === "scene" && e.refId).map((e) => [e.refId!, e.startUs]));
  const byScene = new Map<string, { shotId: string; startUs: bigint; sec: number }[]>();
  let end = 0n;
  for (const e of events) {
    if (e.endUs > end) end = e.endUs;
    if (e.kind !== "shot" || !e.refId) continue;
    const sceneId = shotScene.get(e.refId);
    if (!sceneId) throw new Error(`timeline shot ${e.refId} is not in the film`);
    const list = byScene.get(sceneId) ?? [];
    list.push({ shotId: e.refId, startUs: e.startUs, sec: Number(e.endUs - e.startUs) / 1e6 });
    byScene.set(sceneId, list);
  }
  const order = [...byScene.keys()].sort((a, b) => {
    const sa = sceneStart.get(a) ?? byScene.get(a)![0]!.startUs;
    const sb = sceneStart.get(b) ?? byScene.get(b)![0]!.startUs;
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  return {
    scenes: order.map((sceneId) => ({
      sceneId,
      shots: byScene.get(sceneId)!.sort((a, b) => (a.startUs < b.startUs ? -1 : a.startUs > b.startUs ? 1 : 0)).map(({ shotId, sec }) => ({ shotId, sec })),
    })),
    durationSec: Number(end) / 1e6,
  };
}

/** Is this project's lock already rendered from an approved (or delivered) timeline? (pure) */
export function lockRendered(lockedAt: Date, timelines: { status: string; approvedAt: Date | null }[]): boolean {
  return timelines.some((t) => (t.status === "approved" || t.status === "frozen") && t.approvedAt !== null && t.approvedAt >= lockedAt);
}

/**
 * Apply a timeline's cut to the render's scene assets (pure): scenes in the
 * timeline's order, each shot's clip for exactly its span. A shot the timeline
 * names without a clip is an error — a locked film never renders with gaps.
 */
export function applyCut<A extends { sceneId: string; shotKeys: string[]; shotCutSec?: (number | null)[] }>(
  assets: A[],
  cut: TimelineCut,
  clipOf: Map<string, string | null>,
): A[] {
  const bySceneId = new Map(assets.map((a) => [a.sceneId, a]));
  return cut.scenes.map((sc) => {
    const base = bySceneId.get(sc.sceneId);
    if (!base) throw new Error(`timeline scene ${sc.sceneId} is not in the film`);
    const keys = sc.shots.map((s) => {
      const k = clipOf.get(s.shotId);
      if (!k) throw new Error(`timeline shot ${s.shotId} has no clip`);
      return k;
    });
    return { ...base, shotKeys: keys, shotCutSec: sc.shots.map((s) => s.sec) };
  });
}
