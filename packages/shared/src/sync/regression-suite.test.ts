/**
 * docs/38 §AW.11 — regression tests for today's production failures, at the
 * level of the A/V Sync Engine and runtime classification. One case per row;
 * each asserts what MUST NOT happen. Tests 5 and 6 (unauthorized model,
 * unauthenticated GPU request) belong to the gateway: apps/gpu-worker/tests
 * and packages/model-adapters/e2e/gateway.e2e.test.ts.
 *
 * Real-media counterparts: apps/worker/src/ffmpeg/render-engine.media.test.ts
 * (1), conform.media.test.ts (2), avsync/facts.media.test.ts.
 */
import { describe, expect, it } from "vitest";
import { MasterClock } from "../clock/master-clock";
import { FPS, type FrameRate } from "../clock/rational";
import { classifyVideoResult } from "../runtime/outcome";
import { buildTimelineDraft, type DraftEvent } from "../timeline/build";
import { analyzeSync } from "./engine";
import { syncPolicy } from "./policy";
import { deriveSubtitles } from "./subtitle-sync";
import type { MediaFacts, SyncInput } from "./types";

const clock = new MasterClock({ fps: "24" });
const traced = (key: string, us: bigint, fps: FrameRate = FPS.FILM_24): MediaFacts => ({ eventKey: key, kind: "video", durationUs: us, frameRate: fps, sha256: "a".repeat(64), generationRef: `video_generations:${key}` });

function film(narrationMs: number, pictureSec: number): SyncInput {
  const d = buildTimelineDraft({
    clock,
    scenes: [{ id: "s1", index: 0, shots: [{ id: "a", index: 0, durationSec: pictureSec }],
      dialogue: [{ id: "n1", index: 0, text: "narration", startMs: 0, audioDurationMs: narrationMs }] }],
  });
  return { timelineVersionId: "t", durationUs: d.durationUs, fps: clock.fps, events: d.events, audio: d.audio, media: [traced("shot:a", BigInt(pictureSec * 1_000_000))], policy: syncPolicy("cinematic") };
}

describe("§AW.11 regression suite (engine level)", () => {
  it("1 — narration longer than picture (42 s on 35 s) → FAIL/REPAIR, never silent truncation", () => {
    const input = film(42_000, 35);
    const { report, plan } = analyzeSync(input);
    expect(report.passed).toBe(false);
    const overrun = report.issues.find((i) => i.check === "duration" && i.eventId === "dialogue:n1")!;
    expect(overrun.measured.overrunUs).toBe(7_000_000);
    expect(overrun.message).toContain("speech is never cut");
    // The narration keeps its full length on the timeline; the plan extends picture.
    expect(input.events.find((e) => e.key === "dialogue:n1")!.endUs).toBe(42_000_000n);
    expect(plan.repairs[0]!.action).toMatchObject({ kind: "regenerate_tail", constraint: "approved_dialogue_timing" });
  });

  it("2 — frame-rate mismatch (16 fps source, 24 fps production) → controlled conversion only", () => {
    const unrecorded = analyzeSync({ ...film(1000, 5), media: [traced("shot:a", 5_000_000n, { num: 16, den: 1 })] }, { checks: ["frame_rate"] });
    expect(unrecorded.report.passed).toBe(false); // implicit re-timing refused
    const recorded = analyzeSync({ ...film(1000, 5), media: [{ ...traced("shot:a", 5_000_000n, { num: 16, den: 1 }), conformRecorded: true }] }, { checks: ["frame_rate"] });
    expect(recorded.report.passed).toBe(true);
    expect(recorded.report.issues[0]!.severity).toBe("info");
  });

  it("3 — subtitles derive from authoritative dialogue timing, never an independent estimate", () => {
    const line: DraftEvent = { key: "dialogue:d", kind: "dialogue", startUs: 2_010_000n, endUs: 3_190_000n,
      payload: { text: "Not tonight.", words: [{ text: "Not", startUs: 2_010_000, endUs: 2_300_000 }, { text: "tonight.", startUs: 2_350_000, endUs: 3_190_000 }] } };
    const [cue] = deriveSubtitles([line], FPS.FILM_24);
    expect(cue!.startUs).toBe(2_000_000n); // first spoken word, floored to its frame
    expect(cue!.endUs).toBe(3_208_333n); // last spoken word, ceiled to its frame
  });

  it("4 — dialogue outside the visual speaking segment → issue + repair plan, never silently accepted", () => {
    const input = film(3200, 6);
    input.events.find((e) => e.key === "dialogue:n1")!.startUs = 1_420_000n;
    input.events.find((e) => e.key === "dialogue:n1")!.endUs = 4_620_000n;
    input.events.find((e) => e.key === "dialogue:n1")!.anchor = { key: "shot:a", offsetUs: 1_420_000n, mode: "start" };
    input.events.push({ key: "act:1", kind: "action", startUs: 1_000_000n, endUs: 3_000_000n, payload: { speaking: true, source: "analysis" } });
    const { report, plan } = analyzeSync(input);
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.check === "dialogue_alignment" && i.repair?.kind === "regenerate_tail")).toBe(true);
    expect(plan.repairs.length).toBeGreaterThan(0);
  });

  it("7 — runtime duration mismatch (6.840 s requested, 5.800 s produced) → recorded, never success", () => {
    const d = classifyVideoResult({
      timing: { requestedDurationUs: 6_840_000, actualDurationUs: 5_800_000, timingAccuracy: { deltaUs: -1_040_000, ratio: 0.848 }, frameRate: { num: 25, den: 1 }, frameCount: 145, requestedFrameRate: { num: 25, den: 1 }, conformApplied: "none" },
      request: { durationUs: 6_840_000n, fps: FPS.PAL_25 }, policy: syncPolicy("cinematic"),
    });
    expect(d.actualDurationUs).toBe(5_800_000n);
    expect(d.outcome).not.toBe("ACCEPTED");
    // And placed on a timeline, the engine refuses it too.
    const { report } = analyzeSync({ ...film(1000, 6.84), media: [traced("shot:a", 5_800_000n)] });
    expect(report.issues.some((i) => i.check === "duration" && i.eventId === "shot:a")).toBe(true);
    expect(report.passed).toBe(false);
  });
});
