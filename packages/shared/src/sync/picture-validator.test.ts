import { describe, expect, it } from "vitest";
import { FPS } from "../clock/rational";
import type { DraftEvent } from "../timeline/build";
import { analyzeSync } from "./engine";
import { syncPolicy } from "./policy";
import { validatePicture } from "./picture-validator";
import type { SyncInput } from "./types";

const events: DraftEvent[] = [
  { key: "shot:a", kind: "shot", refId: "a", startUs: 0n, endUs: 5_000_000n },
  { key: "shot:b", kind: "shot", refId: "b", startUs: 5_000_000n, endUs: 10_000_000n },
  { key: "title:end", kind: "title", startUs: 9_000_000n, endUs: 10_000_000n },
];
const input = (media: SyncInput["media"]): SyncInput => ({ timelineVersionId: "t", durationUs: 10_000_000n, fps: FPS.PAL_25, events, audio: [], media, policy: syncPolicy("cinematic") });

describe("picture integrity", () => {
  it("flags black and frozen stretches on the clock, ignoring planned holds", () => {
    const issues = validatePicture(input([
      { eventKey: "shot:a", kind: "video", blackIntervals: [{ startUs: 0n, endUs: 480_000n }], freezeIntervals: [{ startUs: 1_560_000n, endUs: 5_000_000n }] },
      { eventKey: "shot:b", kind: "video", freezeIntervals: [{ startUs: 4_000_000n, endUs: 5_000_000n }] }, // under the end title
    ]));
    expect(issues.map((i) => [i.check, i.atUs, i.severity])).toEqual([
      ["black_frames", 0n, "error"],
      ["dropped_frames", 1_560_000n, "error"],
    ]);
    expect(issues[1]!.message).toContain("frozen for 3.440s");
    expect(issues[1]!.repair).toMatchObject({ kind: "regenerate_shot", shotId: "a" });
  });

  it("runs inside the engine", () => {
    const { report } = analyzeSync(input([{ eventKey: "shot:a", kind: "video", freezeIntervals: [{ startUs: 0n, endUs: 200_000n }] }]), { checks: ["dropped_frames"] });
    expect(report.issues).toHaveLength(1);
    expect(report.passed).toBe(true); // a short freeze is a warning
  });
});
