import { describe, expect, it } from "vitest";
import { parseLevelWindows, summarizeWindows } from "./analyze";

describe("recording level windows", () => {
  it("pairs RMS and peak within each frame block and reads digital silence as -120", () => {
    const text = [
      "frame:0 pts:0 pts_time:0",
      "lavfi.astats.Overall.Peak_level=-6.0",
      "lavfi.astats.Overall.RMS_peak=-nan",
      "lavfi.astats.Overall.RMS_level=-20.5",
      "frame:1 pts:2400 pts_time:0.05",
      "lavfi.astats.Overall.Peak_level=-inf",
      "lavfi.astats.Overall.RMS_level=-inf",
    ].join("\n");
    expect(parseLevelWindows(text)).toEqual([{ rmsDbfs: -20.5, peakDbfs: -6 }, { rmsDbfs: -120, peakDbfs: -120 }]);
  });

  it("derives silence share, peak and a noise floor", () => {
    const speech = Array.from({ length: 70 }, () => ({ rmsDbfs: -22, peakDbfs: -5 }));
    const room = Array.from({ length: 30 }, () => ({ rmsDbfs: -58, peakDbfs: -50 }));
    const s = summarizeWindows([...speech, ...room]);
    expect(s.silenceRatio).toBeCloseTo(0.3);
    expect(s.peakDbfs).toBe(-5);
    expect(s.noiseFloorDbfs).toBe(-58);
  });

  it("reports an empty decode as all silence", () => {
    expect(summarizeWindows([])).toEqual({ silenceRatio: 1, peakDbfs: -120, noiseFloorDbfs: null });
  });
});
