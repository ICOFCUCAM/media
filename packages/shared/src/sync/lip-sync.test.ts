import { describe, expect, it } from "vitest";
import { FPS } from "../clock/rational";
import type { DraftEvent } from "../timeline/build";
import { analyzeSync } from "./engine";
import { validateLipSync } from "./lip-sync";
import { syncPolicy } from "./policy";
import type { SyncInput } from "./types";

const shot: DraftEvent = { key: "shot:17", kind: "shot", refId: "17", startUs: 0n, endUs: 6_000_000n };
const words = (pairs: Array<[number, number]>) => pairs.map(([s, e], i) => ({ text: `w${i}`, startUs: s, endUs: e }));
const line = (pairs: Array<[number, number]>): DraftEvent => ({ key: "dialogue:d1", kind: "dialogue", startUs: BigInt(pairs[0]![0]), endUs: BigInt(pairs[pairs.length - 1]![1]), payload: { words: words(pairs) } });
const mouth = (s: number, e: number, confidence = 0.9): DraftEvent => ({ key: `mouth:${s}`, kind: "action", startUs: BigInt(s), endUs: BigInt(e), payload: { mouthActivity: true, confidence } });
const input = (events: DraftEvent[]): SyncInput => ({ timelineVersionId: "t", durationUs: 6_000_000n, fps: FPS.FILM_24, events: [shot, ...events], audio: [], media: [], policy: syncPolicy("cinematic") });

const SPEECH: Array<[number, number]> = [[1_000_000, 1_400_000], [1_500_000, 2_000_000], [2_200_000, 2_900_000]];
const shifted = (us: number) => SPEECH.map(([s, e]) => mouth(s + us, e + us));

describe("LipSyncValidator (§AU.9)", () => {
  it("in sync → no issue", () => {
    expect(validateLipSync(input([line(SPEECH), ...shifted(0)]))).toEqual([]);
  });

  it("measures the offset and applies the asymmetric window", () => {
    // Mouths move 200 ms before the sound: sound lags by 0.2 s (> 125 ms lag limit).
    const [lag] = validateLipSync(input([line(SPEECH), ...shifted(-200_000)]));
    expect(lag).toMatchObject({ check: "lip_sync", measured: { offsetUs: 200_000 } });
    expect(lag!.message).toBe("Shot 17: sound lags the visible speech by 0.200s");
    // Sound 60 ms early: outside the 45 ms lead limit; 60 ms late is fine.
    expect(validateLipSync(input([line(SPEECH), ...shifted(60_000)]))[0]!.message).toContain("leads the visible speech by 0.060s");
    expect(validateLipSync(input([line(SPEECH), ...shifted(-60_000)]))).toEqual([]);
  });

  it("weak or low-confidence evidence goes to a person", () => {
    const [weak] = validateLipSync(input([line(SPEECH), mouth(4_000_000, 4_300_000)]));
    expect(weak).toMatchObject({ repair: { kind: "human_review" } });
    const [lowConf] = validateLipSync(input([line(SPEECH), ...SPEECH.map(([s, e]) => mouth(s, e, 0.4))]));
    expect(lowConf).toMatchObject({ repair: { kind: "human_review" }, confidence: 0.4 });
  });

  it("speaking with no dialogue is flagged; without analysis there is nothing to judge", () => {
    expect(validateLipSync(input([mouth(1_000_000, 2_000_000)]))[0]!.message).toBe("Shot 17: visible speaking for 1.000s with no dialogue");
    expect(validateLipSync(input([line(SPEECH)]))).toEqual([]);
  });

  it("runs in the engine under lip_sync", () => {
    const { report } = analyzeSync(input([line(SPEECH), ...shifted(-200_000)]), { checks: ["lip_sync"] });
    expect(report.issues.map((i) => i.check)).toEqual(["lip_sync"]);
  });
});
