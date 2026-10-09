import { describe, expect, it } from "vitest";
import { planSceneCount, planShotsPerScene } from "@cineforge/shared";
import { renderPlanRequest } from "@cineforge/movie";
import { constraintsFor, planProductionFor, productionOf, renderStyleFor } from "./production";

describe("production types → planning (W11)", () => {
  it("a live-action film plans exactly as before (same scenes, shots and request)", () => {
    for (const t of [30, 180, 600, 3600]) {
      const c = constraintsFor(t, productionOf({}));
      expect(c.sceneCount).toBe(planSceneCount(t));
      expect(c.maxShotsPerScene).toBe(planShotsPerScene());
      expect(c).not.toHaveProperty("episodes");
      expect(c).not.toHaveProperty("narrated");
    }
    expect(planProductionFor(productionOf({}))).toBeUndefined();
  });

  it("formats set the pace: a trailer cuts fast, a story is narrated, a series has one act per episode", () => {
    const trailer = constraintsFor(60, productionOf({ kind: "trailer" }));
    expect(trailer.sceneCount).toBe(10);
    expect(trailer.sceneSec).toBe(6);
    expect(constraintsFor(180, productionOf({ kind: "story" })).narrated).toBe(true);
    const series = constraintsFor(120, productionOf({ kind: "series", episodes: 12 }));
    expect(series).toMatchObject({ episodes: 12 });
    expect(series.sceneCount).toBeGreaterThanOrEqual(12);
  });

  it("animation reaches the plan request and the prompt compilers", () => {
    const spec = productionOf({ kind: "short_film", medium: "animation", animationStyle: "anime" });
    const prod = planProductionFor(spec)!;
    expect(prod).toMatchObject({ format: "Short film", medium: "animation", style: { label: "Anime-inspired" } });
    const req = renderPlanRequest("A boy and the talking moon.", constraintsFor(120, spec), prod);
    expect(req).toContain("PRODUCTION (hard)");
    expect(req).toContain("- medium: ANIMATION");
    expect(req).toMatch(/animation style: Anime-inspired — anime-inspired 2D animation/);
    expect(renderStyleFor(spec)).toMatchObject({ medium: "animation", style: "anime", avoid: expect.stringContaining("photorealistic") });
    expect(renderStyleFor(productionOf({}))).toBeNull();
  });

  it("a motion comic is the motion-comic style; an invalid row is refused, not guessed", () => {
    expect(planProductionFor(productionOf({ kind: "motion_comic", medium: "animation", animationStyle: "motion_comic" }))?.direction[0]).toMatch(/comic PANEL/);
    expect(() => productionOf({ kind: "motion_comic", medium: "animation", animationStyle: "anime" })).toThrow(/motion comic/i);
    expect(() => productionOf({ kind: "series" })).toThrow(/episodes/);
    expect(() => productionOf({ kind: "podcast" })).toThrow(/unknown format/);
  });
});
