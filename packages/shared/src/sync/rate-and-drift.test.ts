import { describe, expect, it } from "vitest";
import { FPS } from "../clock/rational";
import type { DraftEvent } from "../timeline/build";
import { syncPolicy } from "./policy";
import { detectDrift, validateFrameRates } from "./rate-and-drift";
import type { MediaFacts, SyncInput } from "./types";

const shots: DraftEvent[] = Array.from({ length: 6 }, (_, i) => ({ key: `shot:${i}`, kind: "shot" as const, refId: String(i), startUs: BigInt(i) * 10_000_000n, endUs: BigInt(i + 1) * 10_000_000n }));
const base = (media: MediaFacts[]): SyncInput => ({ timelineVersionId: "t", durationUs: 60_000_000n, fps: FPS.FILM_24, events: shots, audio: [], media, policy: syncPolicy("cinematic") });

describe("FrameRateValidator", () => {
  it("accepts the production rate, notes a recorded conform, rejects an implicit one", () => {
    const issues = validateFrameRates(base([
      { eventKey: "shot:0", kind: "video", frameRate: { num: 24, den: 1 } },
      { eventKey: "shot:1", kind: "video", frameRate: { num: 16, den: 1 }, conformRecorded: true },
      { eventKey: "shot:2", kind: "video", frameRate: { num: 16, den: 1 }, mediaVersionId: "mv2" },
    ]));
    expect(issues.map((i) => [i.eventId, i.severity])).toEqual([["shot:1", "info"], ["shot:2", "error"]]);
    expect(issues[1]!.repair).toEqual({ kind: "conform_frame_rate", mediaVersionId: "mv2", toFps: "24/1" });
  });
});

describe("DriftDetector", () => {
  const offsets = (vals: number[]): MediaFacts[] => vals.map((v, i) => ({ eventKey: `shot:${i}`, kind: "audio", offsetUs: BigInt(v) }));

  it("a constant offset is not drift", () => {
    expect(detectDrift(base(offsets([30_000, 30_000, 31_000, 29_000, 30_000, 30_000])))).toEqual([]);
  });

  it("a growing offset is drift (e.g. 23.976 audio under 24 fps picture: ~60 ms/min)", () => {
    const [d] = detectDrift(base(offsets([0, 10_000, 20_000, 30_000, 40_000, 50_000])));
    expect(d).toMatchObject({ check: "drift", measured: { accumulatedUs: 50_000, msPerMinute: 60 } });
    expect(d!.message).toContain("drifts by 0.050s");
  });

  it("needs at least three measurements", () => {
    expect(detectDrift(base(offsets([0, 90_000])))).toEqual([]);
  });
});
