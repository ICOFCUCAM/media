import { describe, expect, it } from "vitest";
import { FPS } from "../clock/rational";
import { parseBlackFrames, parseEbur128Summary, parseFreezes, parseSilences, validateLoudness } from "./loudness";
import { syncPolicy } from "./policy";
import type { MediaFacts, SyncInput } from "./types";

const SUMMARY = `[Parsed_ebur128_0 @ 0x55] Summary:

  Integrated loudness:
    I:         -23.4 LUFS
    Threshold: -33.6 LUFS

  Loudness range:
    LRA:         4.2 LU
    Threshold: -43.7 LUFS
    LRA low:   -26.0 LUFS
    LRA high:  -21.8 LUFS

  True peak:
    Peak:       -1.6 dBFS
`;

describe("FFmpeg analysis parsers", () => {
  it("reads the ebur128 summary", () => {
    expect(parseEbur128Summary(`frame noise...\n${SUMMARY}`)).toEqual({ integratedLufs: -23.4, lra: 4.2, truePeakDbtp: -1.6 });
    expect(parseEbur128Summary("no summary")).toBeNull();
  });
  it("reads silence, black and freeze intervals onto the clock", () => {
    expect(parseSilences("[silencedetect] silence_start: 0\n[silencedetect] silence_end: 0.5 | silence_duration: 0.5\n[silencedetect] silence_start: 4.25", 5_000_000n))
      .toEqual([{ startUs: 0n, endUs: 500_000n }, { startUs: 4_250_000n, endUs: 5_000_000n }]);
    expect(parseBlackFrames("[blackdetect] black_start:0 black_end:0.0416667 black_duration:0.0416667")).toEqual([{ startUs: 0n, endUs: 41_667n }]);
    expect(parseFreezes("lavfi.freezedetect.freeze_start: 1.5\nlavfi.freezedetect.freeze_duration: 1\nlavfi.freezedetect.freeze_end: 2.5")).toEqual([{ startUs: 1_500_000n, endUs: 2_500_000n }]);
  });
});

describe("LoudnessValidator", () => {
  const input = (media: MediaFacts[], profile = "broadcast"): SyncInput => ({
    timelineVersionId: "t", durationUs: 10_000_000n, fps: FPS.PAL_25, media, audio: [], policy: syncPolicy(profile),
    events: [
      { key: "dialogue:a", kind: "dialogue", startUs: 0n, endUs: 1_000_000n },
      { key: "dialogue:b", kind: "dialogue", startUs: 2_000_000n, endUs: 3_000_000n },
      { key: "dialogue:c", kind: "dialogue", startUs: 4_000_000n, endUs: 5_000_000n },
    ],
  });
  const program = (i: number, tp: number): MediaFacts => ({ eventKey: "program", kind: "audio", loudness: { integratedLufs: i, truePeakDbtp: tp } });

  it("passes a broadcast mix on target", () => {
    expect(validateLoudness(input([program(-23.4, -1.6)]))).toEqual([]);
  });
  it("flags off-target loudness and true-peak overs against the profile's delivery", () => {
    const issues = validateLoudness(input([program(-16, 0.4)]));
    expect(issues.map((i) => [i.check, i.severity])).toEqual([["loudness", "error"], ["clipping", "blocker"]]);
    // The same mix is on target for a streaming profile.
    expect(validateLoudness(input([program(-16, -1.2)], "cinematic"))).toEqual([]);
  });
  it("flags a dialogue line far from the others", () => {
    const d = (k: string, i: number): MediaFacts => ({ eventKey: k, kind: "audio", loudness: { integratedLufs: i, truePeakDbtp: -3 } });
    const issues = validateLoudness(input([d("dialogue:a", -24), d("dialogue:b", -23), d("dialogue:c", -32)]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe("dialogue:c is -8.0 LU from the other dialogue");
  });
});
