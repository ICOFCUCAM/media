import { describe, expect, it } from "vitest";
import { ANIMATION_STYLES, KIND_PROFILES, PRODUCTION_KINDS, STYLE_PROFILES, productionIssues, renderLook, isStillMotion } from "./production";

describe("production profiles (W11; Part 5)", () => {
  it("every format and style has a profile", () => {
    for (const k of PRODUCTION_KINDS) expect(KIND_PROFILES[k].id).toBe(k);
    for (const s of ANIMATION_STYLES) expect(STYLE_PROFILES[s].id).toBe(s);
    for (const s of ANIMATION_STYLES) expect(STYLE_PROFILES[s].avoid).toMatch(/live action/);
  });

  it("checks the same rules as the database", () => {
    expect(productionIssues({ kind: "film", medium: "live_action", animationStyle: null })).toEqual([]);
    expect(productionIssues({ kind: "film", medium: "animation", animationStyle: null })).toEqual(["animation needs a style"]);
    expect(productionIssues({ kind: "film", medium: "live_action", animationStyle: "anime" })).toEqual(["live action has no animation style"]);
    expect(productionIssues({ kind: "series", medium: "animation", animationStyle: "2d_tv" })).toEqual(["a series made in one pass has 1–5 episodes; make longer shows episode by episode"]);
    expect(productionIssues({ kind: "series", medium: "animation", animationStyle: "2d_tv", episodes: 6 })).toHaveLength(1);
    expect(productionIssues({ kind: "episode", medium: "animation", animationStyle: "2d_tv" })).toEqual(["an episode names its show and its number"]);
    expect(productionIssues({ kind: "episode", medium: "animation", animationStyle: "2d_tv", seriesId: "s1", episodeNumber: 7 })).toEqual([]);
    expect(productionIssues({ kind: "episode", medium: "animation", animationStyle: "2d_tv", seriesId: "s1", episodeNumber: 0 })).toEqual(["an episode number is 1–500"]);
    expect(productionIssues({ kind: "film", medium: "live_action", animationStyle: null, seriesId: "s1" })).toEqual(["only an episode belongs to a show"]);
    expect(productionIssues({ kind: "film", medium: "live_action", animationStyle: null, episodes: 3 })).toEqual(["only a series has episodes"]);
    expect(productionIssues({ kind: "motion_comic", medium: "live_action", animationStyle: null })).toEqual(expect.arrayContaining(["a motion comic is animation"]));
  });

  it("checks runtime and aspect for the format", () => {
    expect(productionIssues({ kind: "trailer", medium: "live_action", animationStyle: null }, 600)).toEqual(["a trailer runs 15–180s, not 600s"]);
    expect(productionIssues({ kind: "social_short", medium: "live_action", animationStyle: null }, 30, "16:9")).toEqual(["a social short is 9:16 or 1:1 or 4:5, not 16:9"]);
  });

  it("live action keeps the photographic default; animation gets its look", () => {
    expect(renderLook({ medium: "live_action", animationStyle: null })).toBeNull();
    expect(renderLook({ medium: "animation", animationStyle: "storybook" })?.family).toBe("storybook");
  });

  it("storybook and motion comic are drawn stills moved by the camera; every other look runs the video model", () => {
    expect(ANIMATION_STYLES.filter((s) => isStillMotion({ medium: "animation", animationStyle: s }))).toEqual(["storybook", "motion_comic"]);
    expect(isStillMotion({ medium: "live_action", animationStyle: null })).toBe(false);
  });
});

describe("the web app's copy", () => {
  it("is identical to this file (apps/web/lib/production-types.ts)", async () => {
    const { readFile } = await import("node:fs/promises");
    const here = await readFile(new URL("./production.ts", import.meta.url), "utf8");
    const web = await readFile(new URL("../../../apps/web/lib/production-types.ts", import.meta.url), "utf8");
    expect(web.split("\n").slice(3).join("\n")).toBe(here);
  });
});
