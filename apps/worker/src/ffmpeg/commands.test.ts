import { describe, it, expect } from "vitest";
import {
  duckVolumeExpr,
  planVoicePlacement,
  loudnessCorrectionArgs,
  outroTextArgs,
  normalizeArgs,
  concatListContent,
  concatArgs,
  audioMixArgs,
  muxArgs,
  hlsArgs,
  extendVideoArgs,
  planNarrationFit,
  NarrationOverrunError,
} from "./commands";

describe("ffmpeg command builders", () => {
  it("normalizes to a uniform format", () => {
    const a = normalizeArgs("in.mp4", "out.mp4", { width: 1280, height: 720, fps: 24 });
    expect(a).toContain("libx264");
    expect(a.join(" ")).toContain("scale=1280:720:force_original_aspect_ratio=decrease");
    expect(a.join(" ")).toContain("fps=fps=24/1:round=near:eof_action=pass");
    expect(a).toContain("-an"); // drop audio at normalize stage
  });

  it("escapes quotes in concat list", () => {
    const list = concatListContent(["a.mp4", "b's clip.mp4"]);
    expect(list).toBe("file 'a.mp4'\nfile 'b'\\''s clip.mp4'\n");
  });

  it("concats via the concat demuxer with stream copy", () => {
    expect(concatArgs("list.txt", "scene.mp4")).toEqual([
      "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "scene.mp4",
    ]);
  });

  it("ducks music under voice and loudness-normalizes", () => {
    const a = audioMixArgs({ music: "m.mp3", voice: "v.wav", sfx: "s.wav" }, "mix.m4a").join(" ");
    expect(a).toContain("sidechaincompress");
    expect(a).toContain("loudnorm");
    expect(a).toContain("amix=inputs=3");
    // loudnorm outputs 192 kHz: the master is resampled to 48 kHz (a 96 kHz master was delivered).
    expect(a).toMatch(/loudnorm=[^;]*,aresample=48000\[aout\]/);
    expect(a).toContain("-ar 48000 -c:a aac");
  });

  it("handles music-only mix (no voice -> no ducking)", () => {
    const a = audioMixArgs({ music: "m.mp3" }, "mix.m4a").join(" ");
    expect(a).not.toContain("sidechaincompress");
    expect(a).toContain("amix=inputs=1");
  });

  it("throws when no audio inputs given", () => {
    expect(() => audioMixArgs({}, "mix.m4a")).toThrow();
  });

  it("muxes video+audio with faststart and optional subtitles", () => {
    const plain = muxArgs("v.mp4", "a.m4a", "final.mp4").join(" ");
    expect(plain).toContain("+faststart");
    expect(plain).not.toContain("mov_text");
    // Regression (docs/38 §AW.11 test 1): -shortest silently cut narration.
    expect(plain).not.toContain("-shortest");
    expect(muxArgs("v.mp4", "a.m4a", "final.mp4", { durationSec: 42 }).join(" ")).toContain("-t 42.000");

    const subbed = muxArgs("v.mp4", "a.m4a", "final.mp4", { subtitles: "s.srt" }).join(" ");
    expect(subbed).toContain("mov_text");
    expect(subbed).toContain("-map 2");
  });

  it("builds a 3-rung HLS ladder", () => {
    const a = hlsArgs("final.mp4", "hls").join(" ");
    expect(a).toContain("split=3");
    expect(a).toContain("master.m3u8");
    expect(a).toContain("v:0,a:0 v:1,a:0 v:2,a:0");
  });
});

describe("outroTextArgs", () => {
  it("reads the line from a text file and keeps the encode uniform", () => {
    const args = outroTextArgs("/w/outro.mp4", "/w/out.mp4", "/w/outro.txt", "/fonts/Sans.ttf");
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("fontfile=/fonts/Sans.ttf");
    expect(vf).toContain("textfile=/w/outro.txt");
    expect(vf).toContain("expansion=none");
    expect(vf).not.toContain("text=A film");
    expect(vf.endsWith("format=yuv420p")).toBe(true);
    expect(args[0]).toBe("-i");
    expect(args.at(-1)).toBe("/w/out.mp4");
    expect(args).toContain("-an");
  });
});

describe("audioMixArgs score loop", () => {
  it("loops the score to the film's length when asked", () => {
    const args = audioMixArgs({ music: "m.wav", voice: "v.m4a" }, "mix.m4a", { musicLoopSec: 92.4 });
    const i = args.indexOf("m.wav");
    expect(args.slice(i - 5, i + 1)).toEqual(["-stream_loop", "-1", "-t", "93", "-i", "m.wav"]);
    expect(args.indexOf("v.m4a") - 1).toBe(args.lastIndexOf("-i"));
  });
  it("leaves the score alone by default", () => {
    expect(audioMixArgs({ music: "m.wav" }, "mix.m4a")).not.toContain("-stream_loop");
  });
});

describe("planNarrationFit — narration is never cut (docs/38 §AW.11 test 1)", () => {
  const plan = (pictureSec: number, narrationSec: number, policy: "fail" | "extend" = "fail") =>
    planNarrationFit({ pictureSec, narrationSec, toleranceSec: 0.5, policy });

  it("regression test 1: narration 42 s over a 35 s picture is a timeline mismatch, not a silent cut", () => {
    const fit = plan(35, 42);
    expect(fit).toMatchObject({ action: "fail", overrunSec: 7 });
    const err = new NarrationOverrunError(fit);
    expect(err.code).toBe("TIMELINE_MISMATCH");
    expect(err.message).toContain("42.0s");
    expect(err.message).toContain("35.0s");
  });

  it("extend policy holds the last frame until the narration ends", () => {
    expect(plan(35, 42, "extend")).toMatchObject({ action: "extend", padSec: 7, outputSec: 42 });
  });

  it("a small overrun within tolerance is padded, still never cut", () => {
    expect(plan(35, 35.3)).toMatchObject({ action: "pad", outputSec: 35.3 });
    expect(plan(35, 35.3).padSec).toBeCloseTo(0.3);
  });

  it("narration shorter than the picture keeps the full picture", () => {
    expect(plan(35, 20)).toMatchObject({ action: "fits", padSec: 0, outputSec: 35 });
  });

  it("the output is never shorter than the narration unless the render fails", () => {
    for (const [p, n, pol] of [[10, 9, "fail"], [10, 10.4, "fail"], [10, 30, "extend"]] as const) {
      const fit = plan(p, n, pol);
      expect(fit.outputSec).toBeGreaterThanOrEqual(n);
    }
  });
});

describe("extendVideoArgs", () => {
  it("clones the last frame for the requested time", () => {
    expect(extendVideoArgs("in.mp4", "out.mp4", 7).join(" ")).toContain("tpad=stop_mode=clone:stop_duration=7.000");
  });
});

describe("loudnessCorrectionArgs — the second loudness pass (W23)", () => {
  const delivery = { integratedLufs: -16, truePeakDbtp: -1 };
  it("lifts a quiet mix by the measured gap, under a true-peak limiter, at 48 kHz", () => {
    const a = loudnessCorrectionArgs("mix.m4a", "out.m4a", { integratedLufs: -30.2 }, delivery)!.join(" ");
    expect(a).toContain("volume=14.20dB");
    expect(a).toMatch(/alimiter=limit=0\.8414/); // -1.5 dBTP
    expect(a).toContain("-ar 48000 -c:a aac");
  });
  it("leaves a mix within 1 LU, an unmeasured one and digital silence alone", () => {
    expect(loudnessCorrectionArgs("m", "o", { integratedLufs: -16.8 }, delivery)).toBeNull();
    expect(loudnessCorrectionArgs("m", "o", null, delivery)).toBeNull();
    expect(loudnessCorrectionArgs("m", "o", { integratedLufs: -Infinity }, delivery)).toBeNull();
    expect(loudnessCorrectionArgs("m", "o", { integratedLufs: -70.5 }, delivery)).toBeNull();
  });
  it("turns a hot mix down", () => {
    expect(loudnessCorrectionArgs("m", "o", { integratedLufs: -9 }, delivery)!.join(" ")).toContain("volume=-7.00dB");
  });
});

describe("speech on the timeline (W25; Part 1 §40)", () => {
  it("each voice starts with its scene; short ones leave a pause, long ones push the next line, nothing overlaps", () => {
    const spans = [{ startSec: 0, durSec: 5 }, { startSec: 5, durSec: 5 }, { startSec: 10, durSec: 5 }];
    const p = planVoicePlacement(spans, [3, 7, 2]);
    expect(p.voices).toEqual([
      { sceneIndex: 0, startSec: 0, endSec: 3, delayedBySec: 0 },
      { sceneIndex: 1, startSec: 5, endSec: 12, delayedBySec: 0 },
      { sceneIndex: 2, startSec: 12, endSec: 14, delayedBySec: 2 },
    ]);
    expect(p.endSec).toBe(14);
    // 3 → 5 is a 2 s gap (two dips); 12 → 12 is continuous (one dip).
    expect(p.duckRegions).toEqual([{ startSec: 0, endSec: 3 }, { startSec: 5, endSec: 14 }]);
    expect(planVoicePlacement(spans, [null, null, null])).toEqual({ voices: [], duckRegions: [], endSec: 0 });
  });

  it("the dip expression ramps into and out of each region", () => {
    const e = duckVolumeExpr([{ startSec: 1, endSec: 2 }], -12, 0.25);
    expect(e).toBe("1-(1-0.2512)*min(1,min(1,max(0,(t-1.000+0.250)/0.250))*min(1,max(0,(2.000+0.250-t)/0.250)))");
    expect(duckVolumeExpr([], -12)).toBe("1");
  });

  it("with timeline regions the mix ducks by volume automation, not a sidechain, and fades the score", () => {
    const a = audioMixArgs({ music: "m.wav", voice: "v.wav", ambience: "a.wav" }, "o.m4a", { musicLoopSec: 30, duckRegions: [{ startSec: 1, endSec: 2 }] }).join(" ");
    expect(a).not.toContain("sidechaincompress");
    expect(a).toContain("afade=t=in:d=1.5");
    expect(a).toMatch(/volume='1-\(1-0\.2512\)/); // music −12 dB
    expect(a).toMatch(/volume='1-\(1-0\.3981\)/); // ambience −8 dB
    expect(audioMixArgs({ music: "m.wav", voice: "v.wav" }, "o.m4a").join(" ")).toContain("sidechaincompress");
  });
});

describe("cut edges and score fit (W27)", () => {
  it("plans transitions as the shots are entered", async () => {
    const { transitionPlan } = await import("./commands");
    const p = transitionPlan(["dissolve", "cut", "dissolve", "fade_out", "match_cut", "fade_in", "dissolve"], [3, 3, 3, 3, 3, 3, 0.6]);
    expect(p[0]).toEqual({ fadeIn: true, fadeOut: false, dissolve: false }); // a dissolve with nothing before it fades in
    expect(p[1]).toEqual({ fadeIn: false, fadeOut: false, dissolve: false });
    expect(p[2]!.dissolve).toBe(true);
    expect(p[3]!.fadeOut).toBe(true);
    expect(p[4]).toEqual({ fadeIn: false, fadeOut: false, dissolve: false }); // a match cut cuts
    expect(p[5]!.fadeIn).toBe(true);
    expect(p[6]!.dissolve).toBe(false); // too short for a dissolve
  });

  it("builds a timing-preserving dissolve and fades", async () => {
    const { dissolveArgs, fadeArgs } = await import("./commands");
    const d = dissolveArgs("a", "b", "o", 3, ["-an"]).join(" ");
    expect(d).toContain("tpad=stop_mode=clone:stop_duration=0.5");
    expect(d).toContain("xfade=transition=fade:duration=0.5:offset=3.000");
    expect(fadeArgs("a", "o", 4, { fadeIn: true, fadeOut: true }, []).join(" ")).toContain("fade=t=in:st=0:d=0.5,fade=t=out:st=3.500:d=0.5");
  });

  it("loops beds with crossfaded seams only when needed", async () => {
    const { seamlessLoopCopies, seamlessLoopArgs } = await import("./commands");
    expect(seamlessLoopCopies(10, 8, 1)).toBeNull();
    expect(seamlessLoopCopies(1.5, 8, 1)).toBeNull();
    expect(seamlessLoopCopies(3, 8, 1)).toBe(4);
    expect(seamlessLoopCopies(3, 500, 1)).toBeNull();
    const a = seamlessLoopArgs("i", "o", 3, 7, 1).join(" ");
    expect(a.match(/-i i/g)).toHaveLength(3);
    expect(a).toContain("[c0][c1]acrossfade=d=1:c1=qsin:c2=qsin[x1];[x1][c2]acrossfade=d=1:c1=qsin:c2=qsin[j]");
  });

  it("fits the score: re-time within the bound, loop when much shorter, fade when much longer", async () => {
    const { musicFit, retimeArgs } = await import("./commands");
    expect(musicFit(100, 100)).toEqual({ kind: "none" });
    expect(musicFit(110, 100)).toEqual({ kind: "retime", tempo: 1.1 });
    expect(musicFit(90, 100)).toEqual({ kind: "retime", tempo: 0.9 });
    expect(musicFit(50, 100)).toEqual({ kind: "loop" });
    expect(musicFit(200, 100)).toEqual({ kind: "none" });
    expect(retimeArgs("i", "o", 1.1).join(" ")).toContain("atempo=1.10000");
    expect(() => retimeArgs("i", "o", 3)).toThrow();
  });
});
