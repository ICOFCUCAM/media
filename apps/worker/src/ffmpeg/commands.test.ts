import { describe, it, expect } from "vitest";
import {
  normalizeArgs,
  concatListContent,
  concatArgs,
  audioMixArgs,
  muxArgs,
  hlsArgs,
} from "./commands";

describe("ffmpeg command builders", () => {
  it("normalizes to a uniform format", () => {
    const a = normalizeArgs("in.mp4", "out.mp4", { width: 1280, height: 720, fps: 24 });
    expect(a).toContain("libx264");
    expect(a.join(" ")).toContain("scale=1280:720:force_original_aspect_ratio=decrease");
    expect(a.join(" ")).toContain("fps=24");
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
