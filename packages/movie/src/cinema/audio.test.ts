import { describe, expect, it } from "vitest";
import { mayaCoatFixture } from "../ir/fixture";
import { validateCanon } from "../ir/validate";
import { audioAdvisories, soundWords } from "./audio";

describe("audio continuity on the plan (Part 1 §32.6)", () => {
  it("the Maya film sounds like one place", () => {
    expect(audioAdvisories(mayaCoatFixture())).toEqual([]);
  });

  it("sound words ignore filler and plurals", () => {
    expect([...soundWords("Heavy rain on the stones, distant foghorns")]).toEqual(["rain", "stone", "foghorn"]);
  });

  it("a continuous moment whose room or music changes is flagged; a rewording is not", () => {
    const p = mayaCoatFixture();
    p.scenes[2]!.audio.ambience = "heavy rain on the stones";
    expect(audioAdvisories(p)).toEqual([]);
    p.scenes[2]!.audio.ambience = "busy café chatter";
    p.scenes[2]!.audio.music = "upbeat jazz piano";
    expect(audioAdvisories(p).map((a) => `${a.sceneId}/${a.code}/${a.againstSceneId}`)).toEqual(["scene_12/AMBIENCE_BREAK/scene_11", "scene_12/MUSIC_BREAK/scene_11"]);
    // Advisories never fail the plan.
    expect(validateCanon(p).filter((i) => i.code.includes("BREAK"))).toEqual([]);
  });

  it("a place returned to at the same time of day keeps its room tone; a flashback or another hour may differ", () => {
    const p = mayaCoatFixture();
    p.scenes[1]!.audio.ambience = "traffic and sirens";
    expect(audioAdvisories(p).map((a) => `${a.sceneId}/${a.code}`)).toEqual(["scene_11/ROOM_TONE_DRIFT", "scene_12/AMBIENCE_BREAK"]);
    p.scenes[1]!.timeOfDay = "day";
    expect(audioAdvisories(p).map((a) => a.code)).toEqual(["AMBIENCE_BREAK"]);
    p.scenes[1]!.timeOfDay = "night";
    p.scenes[1]!.storyTime = { day: 2, continuous: false, flashback: true };
    expect(audioAdvisories(p).map((a) => a.code)).toEqual(["AMBIENCE_BREAK"]);
  });

  it("silence is a choice: a cue that drops out is not a break", () => {
    const p = mayaCoatFixture();
    p.scenes[2]!.audio.music = null;
    expect(audioAdvisories(p)).toEqual([]);
  });
});
