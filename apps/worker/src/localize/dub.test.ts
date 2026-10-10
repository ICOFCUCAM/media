import { describe, expect, it } from "vitest";
import { lipSyncTargets } from "../lipsync/plan";
import { sceneLipSyncInputs } from "../lipsync/run";
import { lipSyncScenesOf, sceneAssetsOf, type DubbedScene, type RenderSceneRow } from "../render/inputs";
import { dubAssets, dubMixEnabled } from "./dub";

const scenes: RenderSceneRow[] = [{
  id: "s1", index: 0, durationSec: 8,
  shots: [
    { id: "wide", videoKey: "w.mp4", durationSec: 4, cutSec: null, cameraType: "WS", cameraPlan: { shotSize: "WS", subjectKeys: ["char_maya"] } },
    { id: "close", videoKey: "c.mp4", durationSec: 4, cutSec: "3.5", cameraType: "CU", cameraPlan: { shotSize: "CU", subjectKeys: ["char_maya"] } },
  ],
  audioTracks: [
    { kind: "VOICE", key: "voice/en.wav", startMs: 0, durationMs: 8000, meta: { cues: [{ lineId: "l1", durationMs: 2000 }] } },
    { kind: "MUSIC", key: "music.mp3", startMs: 0, durationMs: 8000, meta: null },
    { kind: "AMBIENCE", key: "rain.wav", startMs: 0, durationMs: 8000, meta: { plannedSceneMs: 8000 } },
    { kind: "SFX", key: "stub.wav", startMs: 0, durationMs: 1000, meta: { generated: "stub" } },
  ],
  dialogueLines: [{ id: "l1", characterId: "db-maya", audioKey: "lines/l1.wav", startMs: 4500 }],
}];
const dubbed = new Map<string, DubbedScene>([["s1", {
  trackKey: "dub/fr/s1.wav",
  cues: [{ lineId: "l1", characterId: "db-maya", startMs: 4200, durationMs: 2600 }, { lineId: null, characterId: null, startMs: 0, durationMs: 3000 }],
}]]);

describe("dubbed films as real masters (W22)", () => {
  it("a dub keeps the film's music and sound design, swaps in the language's voice, and uses lip-synced clips where there are some", () => {
    const original = sceneAssetsOf(scenes);
    expect(original[0]).toMatchObject({ voiceKey: "voice/en.wav", musicKey: "music.mp3", shotKeys: ["w.mp4", "c.mp4"], shotCutSec: [null, 3.5] });
    expect(original[0]!.sounds!.map((s) => s.key)).toEqual(["rain.wav"]); // stub rows are never used
    const dub = dubAssets(scenes, dubbed, new Map([["close", "lipsync/fr-close.mp4"]]));
    expect(dub[0]).toMatchObject({ voiceKey: "dub/fr/s1.wav", musicKey: "music.mp3", shotKeys: ["w.mp4", "lipsync/fr-close.mp4"] });
    expect(dub[0]!.sounds).toEqual(original[0]!.sounds);
    // A scene with nothing to say in this language has no voice, never the original one.
    expect(dubAssets(scenes, new Map(), new Map())[0]!.voiceKey).toBeUndefined();
  });

  it("dub lip sync reads the translated line out of the dubbed scene track, where and as long as it is spoken", () => {
    const [ls] = lipSyncScenesOf(scenes, dubbed);
    expect(ls!.lines).toEqual([{ id: "l1", characterId: "db-maya", audioKey: "dub/fr/s1.wav", startMs: 4200, offsetMs: 4200 }]);
    const { shots, lines } = sceneLipSyncInputs(ls!, () => ["db-maya"]);
    const targets = lipSyncTargets(shots, lines);
    // The wide never; the close shot starts at 4 s and the French line runs 4.2–6.8 s → slice 0.2–2.8 s into the shot,
    // read from 4.2 s into the scene track.
    expect(targets).toEqual([{ shotId: "close", videoKey: "c.mp4", durSec: 3.5, speechSec: 2.6,
      segments: [{ lineId: "l1", audioKey: "dub/fr/s1.wav", atSec: 0.2, fromSec: 4.2, durSec: 2.6 }] }]);
    // The original language still reads each line's own file from its start.
    const [orig] = lipSyncScenesOf(scenes);
    const o = sceneLipSyncInputs(orig!, () => ["db-maya"]);
    expect(lipSyncTargets(o.shots, o.lines)[0]!.segments[0]).toMatchObject({ audioKey: "lines/l1.wav", fromSec: 0, atSec: 0.5 });
  });

  it("DUB_MIX=0 keeps the old voice swap", () => {
    expect([dubMixEnabled({}), dubMixEnabled({ DUB_MIX: "0" })]).toEqual([true, false]);
  });
});
