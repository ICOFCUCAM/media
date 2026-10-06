import { describe, expect, it } from "vitest";
import { buildTimelineDraft, MasterClock, syncPolicy } from "@cineforge/shared";
import { isMissingTable, loadProjectSource, saveTimelineDraft, type TimelineDb } from "./store";

function fakeDb(opts: { latest?: { id: string; version: number } | null; missing?: boolean } = {}) {
  const created: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  const audio: Record<string, unknown>[] = [];
  const db: TimelineDb = {
    scene: {
      findMany: async () => [{
        id: "s1", index: 0,
        shots: [{ id: "a", index: 0, durationSec: 5 }],
        dialogue: [{ id: "d1", index: 0, text: "hello there friend", emotion: null, startMs: 250, characterId: "c1" }],
        audioTracks: [{ id: "m1", kind: "MUSIC", startMs: 0, durationMs: 4000, gainDb: -10 }],
      }],
    },
    productionTimeline: {
      findFirst: async () => opts.latest ?? null,
      create: async ({ data }) => {
        if (opts.missing) throw Object.assign(new Error("The table `public.production_timelines` does not exist"), { code: "P2021" });
        created.push(data);
        return { id: "t-new", version: data.version as number };
      },
    },
    timelineEvent: { createMany: async ({ data }) => { events.push(...data); return { count: data.length }; } },
    audioEvent: { createMany: async ({ data }) => { audio.push(...data); return { count: data.length }; } },
    $transaction: async (fn) => fn(db),
  };
  return { db, created, events, audio };
}

describe("timeline store", () => {
  it("saves the next draft version with resolvable parent and anchor ids", async () => {
    const { db, created, events, audio } = fakeDb({ latest: { id: "t-1", version: 1 } });
    const source = await loadProjectSource(db, "p1");
    const draft = buildTimelineDraft({ scenes: source, clock: new MasterClock({ fps: "24" }) });
    const r = await saveTimelineDraft(db, "p1", draft, syncPolicy("cinematic"));
    expect(r).toMatchObject({ saved: true, version: 2, events: 3, audio: 1 });
    expect(created[0]).toMatchObject({ projectId: "p1", version: 2, parentVersionId: "t-1", fpsNum: 24, fpsDen: 1, status: "draft", syncPolicyId: "cinematic", syncPolicyVersion: 1 });
    const byKind = Object.fromEntries(events.map((e) => [e.kind as string, e]));
    expect(byKind.shot!.parentEventId).toBe(byKind.scene!.id);
    expect(byKind.dialogue).toMatchObject({ anchorEventId: byKind.shot!.id, anchorMode: "start", anchorOffsetUs: 250_000n, refType: "dialogue_line", refId: "d1" });
    expect(audio[0]).toMatchObject({ stem: "music", startUs: 0n, endUs: 4_000_000n, gainDb: -10 });
  });

  it("reports missing tables instead of failing (migrations not applied yet)", async () => {
    const { db } = fakeDb({ missing: true });
    const draft = buildTimelineDraft({ scenes: await loadProjectSource(db, "p1"), clock: new MasterClock({ fps: "24" }) });
    expect(await saveTimelineDraft(db, "p1", draft, syncPolicy("cinematic"))).toEqual({ saved: false, reason: "TABLES_MISSING" });
    expect(isMissingTable(new Error('relation "public.timeline_events" does not exist'))).toBe(true);
    expect(isMissingTable(new Error("deadlock"))).toBe(false);
  });
});
