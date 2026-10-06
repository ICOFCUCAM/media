import { describe, expect, it } from "vitest";
import { analyzeSync, FPS } from "@cineforge/shared";
import { policyFor, toDraftAudio, toDraftEvents } from "./load";

describe("loading a persisted timeline into the engine", () => {
  it("resolves parents and anchors by row id and runs clean", () => {
    const events = toDraftEvents([
      { id: "e-scene", kind: "scene", startUs: 0n, endUs: 5_000_000n, refType: "scene", refId: "s1", parentEventId: null, anchorEventId: null, anchorOffsetUs: null, anchorMode: null, payload: {} },
      { id: "e-shot", kind: "shot", startUs: 0n, endUs: 5_000_000n, refType: "shot", refId: "a", parentEventId: "e-scene", anchorEventId: null, anchorOffsetUs: null, anchorMode: null, payload: {} },
      { id: "e-line", kind: "dialogue", startUs: 1_000_000n, endUs: 2_000_000n, refType: "dialogue_line", refId: "d1", parentEventId: "e-scene", anchorEventId: "e-shot", anchorOffsetUs: 1_000_000n, anchorMode: "start", payload: { text: "hi" } },
    ]);
    expect(events[2]).toMatchObject({ parentKey: "e-scene", anchor: { key: "e-shot", offsetUs: 1_000_000n, mode: "start" } });
    const audio = toDraftAudio([{ id: "a1", timelineEventId: null, stem: "music", startUs: 0n, endUs: 5_000_000n, gainDb: "-12.00", fadeInUs: 0n, fadeOutUs: 0n, audioGenerationId: null }]);
    expect(audio[0]).toMatchObject({ gainDb: -12, stem: "music" });
    const { report } = analyzeSync({
      timelineVersionId: "t", durationUs: 5_000_000n, fps: FPS.FILM_24, events, audio, policy: policyFor({ syncPolicyId: "cinematic", syncPolicyVersion: 1 } as never).policy,
      media: [{ eventKey: "e-shot", kind: "video", durationUs: 5_000_000n, frameRate: FPS.FILM_24, sha256: "a".repeat(64), generationRef: "video_generations:1" }],
    });
    expect(report.passed).toBe(true);
  });

  it("notes when a timeline asks for a policy version the code does not have", () => {
    expect(policyFor({ syncPolicyId: "broadcast", syncPolicyVersion: 3 } as never).note).toBe("timeline asks for broadcast@3; judged by broadcast@1");
  });
});
