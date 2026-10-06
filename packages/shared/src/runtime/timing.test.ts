import { describe, expect, it } from "vitest";
import { parseAudioTimingReport, parseVideoTimingReport, producedRequestedRate } from "./timing";

// Exactly what apps/gpu-worker/app/timing.py returns for the Wan frame cap.
const WIRE_CAPPED = {
  kind: "video",
  requestedDurationUs: 5_000_000,
  actualDurationUs: 1_562_500,
  containerDurationUs: 1_562_500,
  timingAccuracy: { deltaUs: -3_437_500, ratio: 0.3125 },
  frameRate: { num: 16, den: 1 },
  timebase: { num: 1, den: 16384 },
  frameCount: 25,
  requestedFrameRate: { num: 16, den: 1 },
  conformApplied: "none",
  measuredBy: "ffprobe",
};

describe("video timing report", () => {
  it("parses the GPU worker's wire format onto the clock", () => {
    const r = parseVideoTimingReport(WIRE_CAPPED);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report.actualDurationUs).toBe(1_562_500n);
    expect(r.report.timingAccuracy.deltaUs).toBe(-3_437_500n);
    expect(r.report.timingAccuracy.ratio).toBeCloseTo(0.3125);
    expect(producedRequestedRate(r.report)).toBe(true);
  });

  it("a missing report is its own failure", () => {
    expect(parseVideoTimingReport(null)).toMatchObject({ ok: false, code: "TIMING_REPORT_MISSING" });
    expect(parseVideoTimingReport(undefined)).toMatchObject({ ok: false, code: "TIMING_REPORT_MISSING" });
  });

  it("rejects reports that are not measurements", () => {
    const bad = [
      { ...WIRE_CAPPED, actualDurationUs: 5_000_000, timingAccuracy: { deltaUs: 0, ratio: 1 } }, // echoed, not 25 frames
      { ...WIRE_CAPPED, timingAccuracy: { deltaUs: 0, ratio: 1 } },
      { ...WIRE_CAPPED, actualDurationUs: 1.5 },
      { ...WIRE_CAPPED, frameCount: 0 },
      { ...WIRE_CAPPED, frameRate: { num: 0, den: 1 } },
      { ...WIRE_CAPPED, conformApplied: "stretch" },
      { ...WIRE_CAPPED, kind: "audio" },
      "5.0",
    ];
    for (const b of bad) expect(parseVideoTimingReport(b)).toMatchObject({ ok: false, code: "TIMING_REPORT_INVALID" });
  });
});

describe("audio timing report", () => {
  const wire = {
    requestedStartUs: 0,
    requestedEndUs: 2_000_000,
    actualStartUs: 40_000,
    actualEndUs: 1_960_000,
    durationUs: 2_000_000,
    sampleRate: 48_000,
    loudness: { integratedLufs: -23.1, truePeakDbtp: -2 },
    wordTimestamps: [{ text: "hello", startUs: 40_000, endUs: 500_000, confidence: 0.9 }],
  };

  it("parses words and loudness", () => {
    const r = parseAudioTimingReport(wire);
    expect(r.ok && r.report.wordTimestamps?.[0]).toEqual({ text: "hello", startUs: 40_000n, endUs: 500_000n, confidence: 0.9 });
  });

  it("rejects inverted spans and missing loudness", () => {
    expect(parseAudioTimingReport({ ...wire, requestedEndUs: 0 })).toMatchObject({ ok: false });
    expect(parseAudioTimingReport({ ...wire, loudness: undefined })).toMatchObject({ ok: false });
    expect(parseAudioTimingReport({ ...wire, wordTimestamps: [{ text: "x", startUs: 5, endUs: 1 }] })).toMatchObject({ ok: false });
  });
});
