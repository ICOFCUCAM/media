import { describe, expect, it } from "vitest";
import { FPS } from "./rational";
import { ClockError } from "./time";
import { frameToTimecode, timecodeToFrame, timecodeToUs, usToTimecode } from "./timecode";

describe("SMPTE timecode", () => {
  it("non-drop frame", () => {
    expect(frameToTimecode(0, FPS.FILM_24)).toBe("00:00:00:00");
    expect(frameToTimecode(24 * 3661 + 5, FPS.FILM_24)).toBe("01:01:01:05");
    expect(frameToTimecode(1800, FPS.NTSC_29_97, { dropFrame: false })).toBe("00:01:00:00");
    expect(frameToTimecode(24, FPS.FILM_23_976)).toBe("00:00:01:00");
    expect(usToTimecode(6_840_000n, FPS.FILM_24)).toBe("00:00:06:20");
  });

  it("drop-frame at 29.97 skips ;00 and ;01 except every tenth minute", () => {
    expect(frameToTimecode(1799, FPS.NTSC_29_97)).toBe("00:00:59;29");
    expect(frameToTimecode(1800, FPS.NTSC_29_97)).toBe("00:01:00;02");
    expect(frameToTimecode(17_982, FPS.NTSC_29_97)).toBe("00:10:00;00");
    expect(frameToTimecode(107_892, FPS.NTSC_29_97)).toBe("01:00:00;00");
    expect(frameToTimecode(3600, FPS.NTSC_59_94)).toBe("00:01:00;04");
    expect(() => timecodeToFrame("00:01:00;01", FPS.NTSC_29_97)).toThrow(ClockError);
  });

  it("round-trips every rate", () => {
    for (const fps of [FPS.FILM_23_976, FPS.FILM_24, FPS.PAL_25, FPS.NTSC_29_97, FPS.NTSC_59_94]) {
      for (let f = 0; f < 200_000; f += 1_237) {
        expect(timecodeToFrame(frameToTimecode(f, fps), fps)).toBe(f);
      }
    }
  });

  it("drop-frame hour of 29.97 equals one wall-clock hour within a frame", () => {
    const us = timecodeToUs("01:00:00;00", FPS.NTSC_29_97);
    expect(Number(us - 3_600_000_000n)).toBeLessThan(33_367);
    expect(Number(us - 3_600_000_000n)).toBeGreaterThan(-33_367);
  });

  it("rejects malformed and out-of-range input and DF at integer rates", () => {
    expect(() => timecodeToFrame("1:00:00:00", FPS.FILM_24)).toThrow(ClockError);
    expect(() => timecodeToFrame("00:00:00:24", FPS.FILM_24)).toThrow(ClockError);
    expect(() => frameToTimecode(10, FPS.FILM_24, { dropFrame: true })).toThrow(ClockError);
  });
});
