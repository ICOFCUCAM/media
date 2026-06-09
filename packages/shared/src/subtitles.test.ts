import { describe, it, expect } from "vitest";
import { buildSrt, buildVtt, timecode, cuesFromLines } from "./subtitles";
import { parseLanguages, languageName, isLanguage } from "./i18n";

describe("subtitles", () => {
  it("formats timecodes for SRT and VTT", () => {
    expect(timecode(1.5, ",")).toBe("00:00:01,500");
    expect(timecode(3661.25, ".")).toBe("01:01:01.250");
    expect(timecode(-5, ",")).toBe("00:00:00,000");
  });

  it("builds a valid SRT block", () => {
    const srt = buildSrt([
      { startSec: 0, endSec: 2, text: "Hello" },
      { startSec: 2, endSec: 4, text: "World" },
    ]);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:02,000\nHello");
    expect(srt).toContain("2\n00:00:02,000 --> 00:00:04,000\nWorld");
  });

  it("builds a WebVTT header + cues", () => {
    const vtt = buildVtt([{ startSec: 0, endSec: 1, text: "Hi" }]);
    expect(vtt.startsWith("WEBVTT\n")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> 00:00:01.000\nHi");
  });

  it("lays lines out evenly across a duration", () => {
    const cues = cuesFromLines(["a", "", "b"], 10); // blank dropped → 2 cues
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ startSec: 0, endSec: 5, text: "a" });
    expect(cues[1]).toEqual({ startSec: 5, endSec: 10, text: "b" });
    expect(cuesFromLines([], 10)).toEqual([]);
  });
});

describe("i18n", () => {
  it("knows languages and parses a CSV keeping only valid codes", () => {
    expect(isLanguage("sw")).toBe(true);
    expect(languageName("yo")).toBe("Yoruba");
    expect(parseLanguages("en, es, xx, fr, es")).toEqual(["en", "es", "fr"]); // dedup + drop invalid
    expect(parseLanguages("")).toEqual(["en"]); // fallback
  });
});
