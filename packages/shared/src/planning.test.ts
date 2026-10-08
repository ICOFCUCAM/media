import { describe, expect, it } from "vitest";
import { outputDimensions } from "./planning";

describe("outputDimensions", () => {
  it("honours the chosen format (it used to be 1280×720 for everything)", () => {
    expect(outputDimensions("480p", "16:9")).toEqual([832, 480]);
    expect(outputDimensions("720p", "16:9")).toEqual([1280, 720]);
    expect(outputDimensions("1080p", "16:9")).toEqual([1920, 1080]);
    expect(outputDimensions("4k", "16:9")).toEqual([1920, 1080]);
  });

  it("honours portrait, square and 4:5 placements", () => {
    expect(outputDimensions("720p", "9:16")).toEqual([720, 1280]);
    expect(outputDimensions("720p", "1:1")).toEqual([720, 720]);
    expect(outputDimensions("1080p", "4:5")).toEqual([1080, 1344]);
  });

  it("falls back to 720p 16:9 for unknown values", () => {
    expect(outputDimensions(undefined, undefined)).toEqual([1280, 720]);
    expect(outputDimensions("8k", "wide")).toEqual([1280, 720]);
  });
});
