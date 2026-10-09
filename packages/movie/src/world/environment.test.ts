import { describe, expect, it } from "vitest";
import { mayaCoatFixture } from "../ir/fixture";
import { filmPackageJsonSchema } from "../ir/json-schema";
import { FilmPackage, type FilmPackage as Pkg } from "../ir/schema";
import { validateCanon } from "../ir/validate";
import { clockFitsTimeOfDay, materializeWorld, sunPhase } from "./state";

const codes = (p: Pkg) => validateCanon(p).map((i) => i.code);
/** scene_10 (day 1), scene_11 (day 2), scene_12 (day 2, continues scene_11); all at night. */
function film(f: (p: Pkg) => void): Pkg {
  const p = mayaCoatFixture();
  f(p);
  return p;
}
const at = (p: Pkg, i: number, clock: string | null) => { p.scenes[i]!.storyTime = { ...p.scenes[i]!.storyTime!, clock }; };

describe("environment over story time (W20; Part 1 §32.3, §33)", () => {
  it("the sun follows the clock, or the time of day when there is none", () => {
    expect(["03:00", "06:10", "09:00", "12:30", "15:00", "18:15", "19:50", "22:00"].map((c) => sunPhase(c, "day")))
      .toEqual(["night", "dawn", "morning", "midday", "afternoon", "golden hour", "dusk", "night"]);
    expect([sunPhase(null, "day"), sunPhase(null, "dusk"), sunPhase(undefined, "night")]).toEqual(["midday", "dusk", "night"]);
    expect([clockFitsTimeOfDay("14:00", "day"), clockFitsTimeOfDay("14:00", "night"), clockFitsTimeOfDay("23:30", "night"), clockFitsTimeOfDay("05:30", "night")])
      .toEqual([true, false, true, true]);
  });

  it("weather carries forward through the same story day, not into another day or a flashback", () => {
    const p = film((x) => { x.scenes[1]!.weather = "heavy rain"; });
    const w = materializeWorld(p).scenes.map((s) => [s.clock.weather, s.clock.weatherInherited]);
    expect(w).toEqual([[null, false], ["heavy rain", false], ["heavy rain", true]]);
    const back = film((x) => { x.scenes[1]!.weather = "heavy rain"; x.scenes[2]!.storyTime = { day: 2, continuous: false, flashback: true }; });
    expect(materializeWorld(back).scenes[2]!.clock.weather).toBeNull();
  });

  it("a clock that is not the scene's time of day, or that runs backwards, is refused", () => {
    expect(codes(film((x) => at(x, 1, "14:00")))).toContain("CLOCK_OUTSIDE_TIME_OF_DAY");
    const back = codes(film((x) => { at(x, 1, "23:30"); at(x, 2, "22:00"); }));
    expect(back).toEqual(expect.arrayContaining(["CONTINUOUS_TIME_JUMP", "TIME_REGRESSION"]));
    expect(codes(film((x) => { at(x, 1, "22:00"); at(x, 2, "23:30"); }))).toContain("CONTINUOUS_TIME_JUMP"); // 90 min is not continuous
    expect(codes(film((x) => { at(x, 1, "22:00"); at(x, 2, "22:20"); }))).toEqual([]);
  });

  it("continuous action keeps its weather", () => {
    expect(codes(film((x) => { x.scenes[1]!.weather = "heavy rain"; x.scenes[2]!.weather = "clear skies"; }))).toContain("WEATHER_CHANGE_IN_CONTINUOUS_ACTION");
    expect(codes(film((x) => { x.scenes[1]!.weather = "Heavy rain"; x.scenes[2]!.weather = "heavy rain"; }))).toEqual([]);
  });

  it("packages planned before W20 stay valid; the planner's schema asks for every new field", () => {
    expect(FilmPackage.safeParse(JSON.parse(JSON.stringify(mayaCoatFixture()))).success).toBe(true);
    const schema = JSON.stringify(filmPackageJsonSchema());
    for (const f of ["premise", "audience", "rating", "era", "geography", "narrativeStructure", "clock", "weather", "composition", "depthOfField", "focus"]) {
      expect(schema).toContain(`"${f}"`);
    }
  });
});
