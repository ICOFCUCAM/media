import { describe, expect, it } from "vitest";
import { FPS, FrameRateError, formatFrameRate, frameRate, isProductionRate, parseFrameRate, sameRate } from "./rational";

describe("frame rates", () => {
  it("reduces and validates", () => {
    expect(frameRate(48, 2)).toEqual({ num: 24, den: 1 });
    for (const [n, d] of [[0, 1], [24, 0], [-24, 1], [23.976, 1]] as const) {
      expect(() => frameRate(n, d)).toThrow(FrameRateError);
    }
  });

  it("parses integer, rational, NTSC decimal and ffprobe forms exactly", () => {
    expect(parseFrameRate("24")).toEqual({ num: 24, den: 1 });
    expect(parseFrameRate(16)).toEqual({ num: 16, den: 1 });
    expect(parseFrameRate("24000/1001")).toEqual(FPS.FILM_23_976);
    expect(parseFrameRate("23.976")).toEqual(FPS.FILM_23_976);
    expect(parseFrameRate("29.97")).toEqual(FPS.NTSC_29_97);
    expect(parseFrameRate("59.94")).toEqual(FPS.NTSC_59_94);
    expect(parseFrameRate("12.5")).toEqual({ num: 25, den: 2 });
    expect(parseFrameRate("30/1")).toEqual(FPS.VIDEO_30);
    expect(() => parseFrameRate("0/0")).toThrow(FrameRateError);
    expect(() => parseFrameRate("fast")).toThrow(FrameRateError);
  });

  it("compares by value and formats canonically", () => {
    expect(sameRate({ num: 48, den: 2 }, FPS.FILM_24)).toBe(true);
    expect(sameRate(FPS.FILM_23_976, FPS.FILM_24)).toBe(false);
    expect(formatFrameRate({ num: 48000, den: 2002 })).toBe("24000/1001");
  });

  it("knows the production rates", () => {
    expect(isProductionRate(parseFrameRate("23.976"))).toBe(true);
    expect(isProductionRate({ num: 16, den: 1 })).toBe(false);
  });
});
