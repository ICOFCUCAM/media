import { describe, expect, it } from "vitest";

describe("camera words a model uses that mean one of ours (W27 fix)", () => {
  it("maps a drone angle to overhead with a drone move, and common size words", async () => {
    const { normalizePlan } = await import("./planner");
    const out = normalizePlan({ scenes: [{ shots: [{ angle: "drone", movement: "static", size: "LS" }, { angle: "Eye-Level", size: "cu" }, { angle: "sideways", size: "MS" }] }] }, {}, { sceneCount: 3 } as never) as { scenes: { shots: Record<string, string>[] }[] };
    expect(out.scenes[0]!.shots[0]).toMatchObject({ angle: "overhead", movement: "drone", size: "WS" });
    expect(out.scenes[0]!.shots[1]).toMatchObject({ angle: "eye", size: "CU" });
    expect(out.scenes[0]!.shots[2]).toMatchObject({ angle: "sideways", size: "MS" });
  });
});
