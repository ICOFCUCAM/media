import { describe, expect, it } from "vitest";
import { animaticSize, cardArgs, movementOf, muxArgs, planAnimatic } from "./animatic";
import { buildSceneAnimatic, type AnimaticDb } from "./run";
import { previsFlow } from "../orchestration/previs-flow";

const shots = [
  { id: "s1", durationSec: 4, stillKey: "stills/1.png", cameraMovement: "slow push-in" },
  { id: "s2", durationSec: 3, stillKey: null, cameraMovement: null },
  { id: "s3", durationSec: 0, stillKey: "stills/3.png", cameraMovement: "pan" },
];

describe("previs animatic (W19)", () => {
  it("moves each still the way its shot's camera is planned", () => {
    expect(["static", "pan", "tilt", "dolly", "crane", "handheld", "drone"].map(movementOf)).toEqual(["static", "pan", "tilt", "dolly", "crane", "handheld", "drone"]);
    expect([movementOf("Slow push-in"), movementOf("tracking"), movementOf("aerial sweep"), movementOf("whip pan"), movementOf(null), movementOf("locked off")])
      .toEqual(["dolly", "dolly", "drone", "pan", "static", "static"]);
  });

  it("plans the pictures for each shot's planned length; rough timing flags a voice that runs past them", () => {
    const fits = planAnimatic(shots, 6.8);
    expect(fits.segments.map((s) => [s.shotId, s.durationSec, s.movement])).toEqual([["s1", 4, "dolly"], ["s2", 3, "static"]]);
    expect([fits.pictureSec, fits.overrunSec, fits.missingStills]).toEqual([7, 0, 1]);
    expect(planAnimatic(shots, 7.4).overrunSec).toBe(0); // within tolerance
    expect(planAnimatic(shots, 9.25).overrunSec).toBe(2.25);
    expect(planAnimatic(shots, null)).toMatchObject({ voiceSec: null, overrunSec: 0 });
  });

  it("frames at the project's aspect, 640 on the long side", () => {
    expect(animaticSize("16:9")).toEqual({ width: 640, height: 360 });
    expect(animaticSize("9:16")).toEqual({ width: 360, height: 640 });
    expect(animaticSize(null)).toEqual({ width: 640, height: 360 });
  });

  it("a text-led shot is a dark card; the voice is laid under the pictures and cut to their length", () => {
    expect(cardArgs("o.mp4", { width: 640, height: 360, durationSec: 3 })).toEqual(expect.arrayContaining(["color=c=0x1a1a1a:s=640x360:r=24:d=3.000", "72"]));
    const withVoice = muxArgs("l.txt", "v.wav", "o.mp4", 7);
    expect(withVoice).toEqual(expect.arrayContaining(["-map", "1:a", "apad", "-t", "7.000"]));
    expect(muxArgs("l.txt", null, "o.mp4", 7)).toContain("-an");
  });

  it("records the animatic as the scene's video version with its timing, and flags an overrun", async () => {
    const created: Record<string, unknown>[] = [];
    const db: AnimaticDb = {
      scene: { findUnique: async () => ({
        id: "sc1", index: 2, projectId: "p1", project: { aspectRatio: "16:9" },
        shots: shots.map((s) => ({ id: s.id, durationSec: s.durationSec, seedImageKey: s.stillKey, cameraMovement: s.cameraMovement })),
        audioTracks: [{ key: "scenes/sc1/voice.wav", durationMs: 9500 }],
      }) },
      mediaVersion: { findFirst: async () => null, create: async (a) => { created.push(a.data); return { id: "v", version: 1 }; } },
    };
    const calls: string[][] = [];
    const uploads: string[] = [];
    const out = await buildSceneAnimatic(db, {
      download: async () => {}, upload: async (_p, k) => { uploads.push(k); }, ffmpeg: async (a) => { calls.push(a); },
    }, "sc1", 42);
    expect(out.status).toBe("built");
    if (out.status !== "built") return;
    expect(out.key).toBe("projects/p1/previs/sc1/animatic-42.mp4");
    expect(uploads).toEqual([out.key]);
    expect(calls).toHaveLength(3); // one still in motion, one card, the join
    expect(created[0]).toMatchObject({ assetType: "video", assetId: "sc1", derivation: { role: "animatic", pictureSec: 7, voiceSec: 9.5, overrunSec: 2.5, missingStills: 1 } });
    expect(out.gaps).toEqual([expect.objectContaining({ code: "PREVIS_TIMING", scope: "scene", refId: "sc1" })]);
  });

  it("each scene's previs flow: its stills and voice first, then the animatic; failures never hold it back", () => {
    const f = previsFlow({ id: "p", modelId: "m" }, { id: "sc", index: 0, shots: [{ id: "a", source: "image" }, { id: "b", source: "text" }] }, 7);
    expect(f.name).toBe("animatic");
    expect(f.children.map((c) => c.name)).toEqual(["previs", "voice"]);
    expect(f.children.every((c) => c.opts.ignoreDependencyOnFailure)).toBe(true);
  });
});
