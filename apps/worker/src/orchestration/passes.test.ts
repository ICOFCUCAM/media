import { describe, expect, it } from "vitest";
import { currentPass, scenesCleared } from "./pass-rules";

const at = new Date();

describe("production passes (W8b)", () => {
  it("a single-pass film is always single; a three-pass film moves STORY → PREVIS → FINAL", () => {
    expect(currentPass({ passMode: "single", storyApprovedAt: null }, [])).toBe("single");
    expect(currentPass({ passMode: "three", storyApprovedAt: null }, [{ storyboardApprovedAt: null }])).toBe("story");
    expect(currentPass({ passMode: "three", storyApprovedAt: at }, [{ storyboardApprovedAt: at }, { storyboardApprovedAt: null }])).toBe("previs");
    expect(currentPass({ passMode: "three", storyApprovedAt: at }, [{ storyboardApprovedAt: at }, { storyboardApprovedAt: at }])).toBe("final");
    expect(currentPass({ passMode: "three", storyApprovedAt: at }, [])).toBe("previs");
  });

  it("only approved scenes are cleared for video in a three-pass film", () => {
    const scenes = [{ id: "a", storyboardApprovedAt: at }, { id: "b", storyboardApprovedAt: null }];
    expect(scenesCleared("three", scenes).map((s) => s.id)).toEqual(["a"]);
    expect(scenesCleared("single", scenes).map((s) => s.id)).toEqual(["a", "b"]);
  });
});
