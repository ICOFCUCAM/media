import { describe, expect, it } from "vitest";
import { decideShot, judgeClip, judgeMaster, qualityMode, type MediaFacts } from "./gates";
import { _resetGateRecorder, recordGates, type GateDb } from "./recorder";

const ok: MediaFacts = { readable: true, hasVideo: true, hasAudio: false, durationSec: 5, width: 1280, height: 720, black: [], frozen: [] };
const want = { durationSec: 5, width: 1280, height: 720 };
const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code);

describe("clip technical QC", () => {
  it("passes a good clip", () => {
    expect(judgeClip(ok, want, "record")).toEqual({ gate: "technical", outcome: "pass", findings: [] });
  });

  it("an unusable clip always fails, in any mode", () => {
    for (const mode of ["record", "enforce"] as const) {
      expect(judgeClip({ ...ok, readable: false }, want, mode)).toMatchObject({ outcome: "fail", findings: [{ code: "CLIP_UNREADABLE", severity: "fatal" }] });
      expect(judgeClip({ ...ok, hasVideo: false }, want, mode).outcome).toBe("fail");
      expect(judgeClip({ ...ok, durationSec: 0 }, want, mode).outcome).toBe("fail");
    }
  });

  it("black, frozen and truncated clips: recorded in record mode, blocking in enforce mode", () => {
    const black = { ...ok, black: [[0, 5]] as [number, number][] };
    const frozen = { ...ok, frozen: [[0.2, 5]] as [number, number][] };
    const short = { ...ok, durationSec: 2 };
    for (const f of [black, frozen, short]) {
      expect(judgeClip(f, want, "record").outcome).toBe("warn");
      expect(judgeClip(f, want, "enforce").outcome).toBe("fail");
    }
    expect(codes(judgeClip(black, want, "record"))).toEqual(["CLIP_BLACK"]);
    expect(codes(judgeClip(frozen, want, "record"))).toEqual(["CLIP_FROZEN"]);
    expect(codes(judgeClip(short, want, "record"))).toEqual(["CLIP_TRUNCATED"]);
  });

  it("minor defects are warnings in any mode", () => {
    const r = judgeClip({ ...ok, durationSec: 4.2, width: 832, height: 480, black: [[0, 2]] }, want, "enforce");
    expect(r.outcome).toBe("warn");
    expect(codes(r)).toEqual(["CLIP_SHORT", "CLIP_MOSTLY_BLACK", "CLIP_UNDERSIZED"]);
  });

  it("QUALITY_GATES=enforce switches the mode; record is the default", () => {
    expect(qualityMode({})).toBe("record");
    expect(qualityMode({ QUALITY_GATES: "enforce" })).toBe("enforce");
  });
});

describe("Final Quality Gate (master)", () => {
  const spec = { durationSec: 30, hasSound: true, integratedLufs: -16, truePeakMaxDbtp: -1 };
  const master: MediaFacts = { ...ok, hasAudio: true, durationSec: 30, loudness: { integratedLufs: -16.4, truePeakDbtp: -1.6 } };

  it("passes a good master; editorial is not judged here", () => {
    expect(judgeMaster(master, spec, "enforce").map((r) => [r.gate, r.outcome])).toEqual([["technical", "pass"], ["audio", "pass"]]);
  });

  it("a film with sound delivered silent fails in enforce mode; loudness and peaks are warnings", () => {
    expect(judgeMaster({ ...master, hasAudio: false }, spec, "enforce")[1]).toMatchObject({ outcome: "fail", findings: [{ code: "MASTER_SILENT" }] });
    const loud = judgeMaster({ ...master, loudness: { integratedLufs: -9, truePeakDbtp: 0.3 } }, spec, "enforce")[1]!;
    expect(loud.outcome).toBe("warn");
    expect(codes(loud)).toEqual(["LOUDNESS_OFF_TARGET", "TRUE_PEAK_HIGH"]);
  });

  it("head and tail fades are fine; a black run inside the film is noted; a half-length master blocks", () => {
    expect(judgeMaster({ ...master, black: [[0, 0.8], [29.3, 30]] }, spec, "enforce")[0]!.outcome).toBe("pass");
    expect(codes(judgeMaster({ ...master, black: [[10, 13]] }, spec, "enforce")[0]!)).toEqual(["MASTER_BLACK_RUN"]);
    expect(judgeMaster({ ...master, durationSec: 12 }, spec, "enforce")[0]!.outcome).toBe("fail");
    expect(judgeMaster({ ...master, readable: false }, spec, "record")[0]!.outcome).toBe("fail");
  });

  it("delivery format (W18): codec, pixel format, sample rate and channels are warnings", () => {
    const good = { videoCodec: "h264", pixFmt: "yuv420p", avgFps: 24, rFps: 24, audioCodec: "aac", channels: 2, sampleRate: 48_000, containerSec: 30 };
    const s48 = { ...spec, sampleRate: 48_000 };
    expect(judgeMaster({ ...master, format: good }, s48, "enforce").map((r) => r.outcome)).toEqual(["pass", "pass"]);
    const odd = judgeMaster({ ...master, format: { ...good, videoCodec: "hevc", pixFmt: "yuv444p", audioCodec: "opus", channels: 6, sampleRate: 44_100 } }, s48, "enforce");
    expect(odd.map((r) => r.outcome)).toEqual(["warn", "warn"]);
    expect(codes(odd[0]!)).toEqual(["MASTER_VIDEO_CODEC", "MASTER_PIXEL_FORMAT"]);
    expect(codes(odd[1]!)).toEqual(["AUDIO_CODEC", "AUDIO_SAMPLE_RATE", "AUDIO_CHANNELS"]);
  });
});

describe("frame-level checks (W18)", () => {
  const good = { videoCodec: "h264", pixFmt: "yuv420p", avgFps: 24, rFps: 24, audioCodec: null, channels: null, sampleRate: null, containerSec: 5 };

  it("constant frame rate with all frames present passes", () => {
    expect(judgeClip({ ...ok, format: good }, want, "enforce").outcome).toBe("pass");
  });

  it("variable frame rate, missing frames and a very low frame rate are warnings", () => {
    expect(codes(judgeClip({ ...ok, format: { ...good, avgFps: 21.7 } }, want, "enforce"))).toEqual(["CLIP_VARIABLE_FRAME_RATE"]);
    expect(codes(judgeClip({ ...ok, durationSec: 4.6, format: good }, want, "enforce"))).toEqual(["CLIP_FRAMES_MISSING"]);
    expect(codes(judgeClip({ ...ok, durationSec: 4.9, format: good }, want, "enforce"))).toEqual([]);
    const low = judgeClip({ ...ok, format: { ...good, avgFps: 8, rFps: 8 } }, want, "enforce");
    expect([low.outcome, codes(low)]).toEqual(["warn", ["CLIP_LOW_FRAME_RATE"]]);
  });

  it("the master gets the same checks under its own prefix", () => {
    const master: MediaFacts = { ...ok, durationSec: 30, format: { ...good, avgFps: 20, containerSec: 30 } };
    expect(codes(judgeMaster(master, { durationSec: 30, hasSound: false, integratedLufs: -16, truePeakMaxDbtp: -1 }, "record")[0]!)).toEqual(["MASTER_VARIABLE_FRAME_RATE"]);
  });
});

describe("shot decision: regenerate with a new seed while attempts remain, then fail", () => {
  const black = judgeClip({ ...ok, black: [[0, 5]] }, want, "enforce");
  it("accepts when nothing blocks", () => {
    expect(decideShot([judgeClip(ok, want, "enforce")], { made: 0, max: 3 })).toEqual({ action: "accept" });
  });
  it("regenerates, then fails on the last attempt", () => {
    expect(decideShot([black], { made: 0, max: 3 })).toMatchObject({ action: "regenerate", reason: expect.stringContaining("technical: CLIP_BLACK") });
    expect(decideShot([black], { made: 2, max: 3 })).toMatchObject({ action: "fail" });
  });
});

describe("gate recorder", () => {
  it("writes every gate row; tolerates the table not existing yet", async () => {
    _resetGateRecorder();
    const rows: Record<string, unknown>[] = [];
    const db: GateDb = { qualityGateResult: { createMany: async (a) => { rows.push(...a.data); return {}; } } };
    expect(await recordGates(db, "p", "shot", "s1", [judgeClip(ok, want, "record")], 2)).toBe("recorded");
    expect(rows).toEqual([{ projectId: "p", scope: "shot", refId: "s1", gate: "technical", outcome: "pass", findings: [], attempt: 2 }]);
    const missing: GateDb = { qualityGateResult: { createMany: async () => { throw Object.assign(new Error("relation does not exist"), { code: "P2021" }); } } };
    expect(await recordGates(missing, "p", "shot", "s1", [judgeClip(ok, want, "record")])).toBe("logged");
    _resetGateRecorder();
  });
});
