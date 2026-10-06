import { describe, expect, it } from "vitest";
import { FPS } from "../clock/rational";
import type { DraftAudio, DraftEvent } from "../timeline/build";
import { validateCues } from "./cue-validators";
import { syncPolicy } from "./policy";
import type { SyncInput } from "./types";

const events: DraftEvent[] = [
  { key: "scene:1", kind: "scene", startUs: 0n, endUs: 6_000_000n },
  { key: "shot:a", kind: "shot", startUs: 0n, endUs: 3_000_000n, parentKey: "scene:1" },
  { key: "shot:b", kind: "shot", startUs: 3_000_000n, endUs: 6_000_000n, parentKey: "scene:1" },
  { key: "scene:2", kind: "scene", startUs: 6_000_000n, endUs: 9_000_000n },
];
const music = (key: string, startUs: bigint, endUs: bigint): DraftAudio => ({ key, stem: "music", startUs, endUs, gainDb: -12, fadeInUs: 0n, fadeOutUs: 0n, refType: "audio_track", refId: key });
const input = (extra: Partial<SyncInput>): SyncInput => ({ timelineVersionId: "t", durationUs: 9_000_000n, fps: FPS.FILM_24, events, audio: [], media: [], policy: syncPolicy("cinematic"), ...extra });

describe("cue validators", () => {
  it("music entering and leaving on structure passes", () => {
    expect(validateCues(input({ audio: [music("m1", 0n, 6_000_000n), music("m2", 3_050_000n, 9_000_000n)] }))).toEqual([]);
  });

  it("music cut mid-shot, unanchored, is flagged at both edges as needed", () => {
    const issues = validateCues(input({ audio: [music("m1", 1_200_000n, 7_400_000n)] }));
    expect(issues.map((i) => i.message)).toEqual([
      "m1 enters 1.200s away from any scene boundary or cut, unanchored",
      "m1 exits 1.400s away from any scene boundary or cut, unanchored",
    ]);
  });

  it("effects must be anchored", () => {
    const sfx: DraftEvent[] = [
      { key: "sfx:door", kind: "sfx", startUs: 4_000_000n, endUs: 4_400_000n },
      { key: "sfx:step", kind: "sfx", startUs: 5_000_000n, endUs: 5_200_000n, anchor: { key: "shot:b", offsetUs: 2_000_000n, mode: "start" } },
    ];
    const issues = validateCues(input({ events: [...events, ...sfx] }));
    expect(issues.map((i) => i.eventId)).toEqual(["sfx:door"]);
  });
});
