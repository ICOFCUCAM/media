/**
 * Persist production timelines (migrations 0028–0029) — Phase 4.
 *
 * loadProjectSource reads today's scenes / shots / dialogue / audio tracks;
 * saveTimelineDraft writes a new DRAFT version (next version number, parent =
 * the latest version) with its events and audio placements in one
 * transaction. Approval (which freezes the version) is a separate, explicit
 * step. When the tables are not migrated yet, saving reports
 * { saved: false, reason: "TABLES_MISSING" } instead of failing the caller.
 */
import { randomUUID } from "node:crypto";
import { policyRef, type SourceScene, type SyncPolicy, type TimelineDraft } from "@cineforge/shared";

/** The Prisma surface this module needs (a fake implements it in tests). */
export interface TimelineDb {
  scene: { findMany(args: unknown): Promise<Array<{
    id: string; index: number;
    shots: Array<{ id: string; index: number; durationSec: number; cutSec?: unknown }>;
    dialogue: Array<{ id: string; index: number; text: string; emotion: string | null; startMs: number | null; characterId: string | null }>;
    audioTracks: Array<{ id: string; kind: "VOICE" | "MUSIC" | "SFX" | "AMBIENCE"; startMs: number; durationMs: number | null; gainDb: number }>;
  }>> };
  productionTimeline: {
    findFirst(args: unknown): Promise<{ id: string; version: number } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string; version: number }>;
  };
  timelineEvent: { createMany(args: { data: Array<Record<string, unknown>> }): Promise<{ count: number }> };
  audioEvent: { createMany(args: { data: Array<Record<string, unknown>> }): Promise<{ count: number }> };
  $transaction<T>(fn: (tx: TimelineDb) => Promise<T>): Promise<T>;
}

export function isMissingTable(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === "P2021" || /relation .* does not exist|table .* does not exist/i.test(err?.message ?? "");
}

export async function loadProjectSource(db: Pick<TimelineDb, "scene">, projectId: string): Promise<SourceScene[]> {
  const rows = await db.scene.findMany({
    where: { projectId },
    orderBy: { index: "asc" },
    select: {
      id: true, index: true,
      shots: { select: { id: true, index: true, durationSec: true, cutSec: true }, orderBy: { index: "asc" } },
      dialogue: { select: { id: true, index: true, text: true, emotion: true, startMs: true, characterId: true }, orderBy: { index: "asc" } },
      audioTracks: { select: { id: true, kind: true, startMs: true, durationMs: true, gainDb: true } },
    },
  });
  // A shot the editor cut (W13) occupies its cut length on the timeline.
  return rows.map((s) => ({
    id: s.id, index: s.index,
    shots: s.shots.map((sh) => ({ id: sh.id, index: sh.index, durationSec: sh.cutSec != null && Number(sh.cutSec) > 0 ? Number(sh.cutSec) : sh.durationSec })),
    dialogue: s.dialogue, audioTracks: s.audioTracks,
  }));
}

export type SaveResult =
  | { saved: true; timelineId: string; version: number; events: number; audio: number }
  | { saved: false; reason: "TABLES_MISSING" };

export async function saveTimelineDraft(db: TimelineDb, projectId: string, draft: TimelineDraft, policy: SyncPolicy): Promise<SaveResult> {
  try {
    return await db.$transaction(async (tx) => {
      const latest = await tx.productionTimeline.findFirst({ where: { projectId }, orderBy: { version: "desc" }, select: { id: true, version: true } });
      const timeline = await tx.productionTimeline.create({
        data: {
          projectId,
          version: (latest?.version ?? 0) + 1,
          parentVersionId: latest?.id ?? null,
          fpsNum: draft.clock.fps.num,
          fpsDen: draft.clock.fps.den,
          sampleRate: draft.clock.sampleRate,
          durationUs: draft.durationUs,
          status: "draft",
          syncPolicyId: String(policy.id),
          syncPolicyVersion: policy.version,
        },
      });
      // Client-side ids so parent / anchor references resolve inside one INSERT.
      const ids = new Map(draft.events.map((e) => [e.key, randomUUID()]));
      const events = draft.events.map((e) => ({
        id: ids.get(e.key)!,
        timelineVersionId: timeline.id,
        kind: e.kind,
        startUs: e.startUs,
        endUs: e.endUs,
        refType: e.refType ?? null,
        refId: e.refId ?? null,
        parentEventId: e.parentKey ? (ids.get(e.parentKey) ?? null) : null,
        anchorEventId: e.anchor ? (ids.get(e.anchor.key) ?? null) : null,
        anchorOffsetUs: e.anchor ? e.anchor.offsetUs : null,
        anchorMode: e.anchor?.mode ?? null,
        payload: { ...(e.payload ?? {}), policy: policyRef(policy) },
      }));
      const audio = draft.audio.map((a) => ({
        timelineVersionId: timeline.id,
        timelineEventId: a.eventKey ? (ids.get(a.eventKey) ?? null) : null,
        stem: a.stem,
        startUs: a.startUs,
        endUs: a.endUs,
        gainDb: a.gainDb,
        fadeInUs: a.fadeInUs,
        fadeOutUs: a.fadeOutUs,
      }));
      if (events.length) await tx.timelineEvent.createMany({ data: events });
      if (audio.length) await tx.audioEvent.createMany({ data: audio });
      return { saved: true as const, timelineId: timeline.id, version: timeline.version, events: events.length, audio: audio.length };
    });
  } catch (e) {
    if (isMissingTable(e)) return { saved: false, reason: "TABLES_MISSING" };
    throw e;
  }
}
