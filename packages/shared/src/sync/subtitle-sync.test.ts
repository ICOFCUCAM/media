/** Includes docs/38 §AW.11 regression test 3 — subtitle synchronization. */
import { describe, expect, it } from "vitest";
import { FPS } from "../clock/rational";
import { buildSrt } from "../subtitles";
import type { DraftEvent } from "../timeline/build";
import { syncPolicy } from "./policy";
import { deriveSubtitles, toCues, validateSubtitles } from "./subtitle-sync";

const line = (key: string, startUs: bigint, endUs: bigint, text: string, words?: Array<[string, number, number]>): DraftEvent => ({
  key, kind: "dialogue", startUs, endUs,
  payload: { text, ...(words ? { words: words.map(([t, s, e]) => ({ text: t, startUs: s, endUs: e })) } : {}) },
});

describe("regression test 3: subtitles follow the authoritative dialogue timing", () => {
  // Word timestamps from the dialogue audio (µs on the master clock).
  const d1 = line("dialogue:d1", 1_020_000n, 2_480_000n, "Where were you last night?", [
    ["Where", 1_020_000, 1_250_000], ["were", 1_250_000, 1_400_000], ["you", 1_400_000, 1_560_000],
    ["last", 1_600_000, 1_900_000], ["night?", 1_900_000, 2_480_000],
  ]);

  it("derives cue timing from the word timestamps, snapped to frames", () => {
    const [cue] = deriveSubtitles([d1], FPS.FILM_24);
    expect(cue).toEqual({ startUs: 1_000_000n, endUs: 2_500_000n, text: "Where were you last night?", dialogueKey: "dialogue:d1" });
    expect(buildSrt(toCues([cue!]))).toBe("1\n00:00:01,000 --> 00:00:02,500\nWhere were you last night?\n");
  });

  it("splits long speech at reading limits on word boundaries, still on the spoken timing", () => {
    const cues = deriveSubtitles([d1], FPS.FILM_24, { maxChars: 14, maxDurationUs: 7_000_000n, minDurationUs: 0n });
    expect(cues.map((c) => c.text)).toEqual(["Where were you", "last night?"]);
    expect(cues[1]!.startUs).toBe(1_583_333n); // floor-snapped start of "last" (1.600 s)
    expect(cues[0]!.endUs).toBeLessThanOrEqual(cues[1]!.startUs);
  });

  it("without word timestamps a cue spans its dialogue event — no independent estimate", () => {
    const [cue] = deriveSubtitles([line("dialogue:d2", 4_000_000n, 4_300_000n, "No.")], FPS.FILM_24);
    expect(cue).toMatchObject({ startUs: 4_000_000n, endUs: 4_833_333n }); // minimum display time, on a frame
  });

  it("flags existing subtitles that drifted from the dialogue", () => {
    const sub: DraftEvent = { key: "sub:1", kind: "subtitle", startUs: 1_250_000n, endUs: 2_750_000n, payload: { dialogueKey: "dialogue:d1" } };
    const issues = validateSubtitles({ timelineVersionId: "t", durationUs: 10_000_000n, fps: FPS.FILM_24, events: [d1, sub], audio: [], media: [], policy: syncPolicy("cinematic") });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ check: "subtitle", repair: { kind: "rebuild_subtitles", fromDialogue: true }, expected: { startUs: 1_000_000 } });
  });
});
