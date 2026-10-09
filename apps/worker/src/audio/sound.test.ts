import { describe, expect, it } from "vitest";
import { ambienceRow, renderSound, sfxRow, soundKey, type SoundDeps } from "./sound";

function deps() {
  const store = new Map<string, Uint8Array>();
  const calls: string[] = [];
  const d: SoundDeps = {
    model: "fal-ai/stable-audio",
    generate: async (prompt) => { calls.push(prompt); return { bytes: new Uint8Array([1, 2, 3]), contentType: "audio/wav" }; },
    exists: async (k) => store.has(k),
    put: async (k, b) => { store.set(k, b); },
  };
  return { d, calls, store };
}

describe("sound design generation (Part 1 §18)", () => {
  it("the same request is generated once and reused — the same place keeps the same room tone", async () => {
    const { d, calls } = deps();
    const a = await renderSound("Ambient soundscape: rain on stone", 12, d);
    const b = await renderSound("Ambient soundscape: rain on stone ", 12, d);
    expect(a).toMatchObject({ cached: false, key: expect.stringMatching(/^audio_cache\/sound\/[0-9a-f]{64}$/) });
    expect(b).toMatchObject({ cached: true, key: a.key });
    expect(calls).toHaveLength(1);
    expect(soundKey("m", "x", 12)).not.toBe(soundKey("m", "x", 13));
    expect(soundKey("m", "x", 12)).not.toBe(soundKey("m2", "x", 12));
  });

  it("an empty answer from the model is a failure, not a silent track", async () => {
    const { d } = deps();
    d.generate = async () => ({ bytes: new Uint8Array(), contentType: "audio/wav" });
    await expect(renderSound("x", 3, d)).rejects.toThrow(/no audio/);
  });

  it("ambience runs under the whole scene; an effect starts at its planned moment", () => {
    const plan = { sceneId: "s", plannedSec: 12, ambience: { prompt: "p", seconds: 12 }, sfx: [{ cue: "door slam", prompt: "q", seconds: 3, atSec: 6.4, shotIndex: 2, anchor: "shot_action" as const }] };
    const asset = { key: "audio_cache/sound/x", cached: false, prompt: "p", seconds: 12 };
    expect(ambienceRow(plan, asset, "m")).toMatchObject({ kind: "AMBIENCE", startMs: 0, durationMs: 12000, meta: { loop: true, plannedSceneMs: 12000 } });
    expect(sfxRow(plan, plan.sfx[0]!, asset, "m")).toMatchObject({ kind: "SFX", startMs: 6400, durationMs: 3000, meta: { cue: "door slam", anchor: "shot_action", shotIndex: 2 } });
  });
});
