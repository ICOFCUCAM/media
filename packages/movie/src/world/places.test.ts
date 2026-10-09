import { describe, expect, it } from "vitest";
import { mayaCoatFixture } from "../ir/fixture";
import { reviseCanon } from "./revise";
import { locationReferenceSpec, propReferenceSpec, WorldReferenceError } from "./places";

describe("location and prop reference stills (Part 1 §34–35)", () => {
  it("a place is drawn empty in its own light; a prop alone — in the film's look", () => {
    const pkg = mayaCoatFixture();
    const loc = locationReferenceSpec(pkg, pkg.locations[0]!.id);
    expect(loc.prompt).toMatch(/^Location reference, wide establishing view, no people/);
    expect(loc.prompt).toContain(pkg.locations[0]!.architecture);
    expect(loc.prompt).toContain(pkg.film.visualStyle.palette);
    expect(loc.digest).toMatch(/^[0-9a-f]{64}$/);
    const prop = pkg.props[0];
    if (prop) expect(propReferenceSpec(pkg, prop.id).prompt).toMatch(/^Prop reference, the object alone/);
  });

  it("a canon change gives a new digest; unchanged canon keeps it", () => {
    const pkg = mayaCoatFixture();
    const id = pkg.locations[0]!.id;
    const before = locationReferenceSpec(pkg, id).digest;
    expect(locationReferenceSpec(mayaCoatFixture(), id).digest).toBe(before);
    const { pkg: revised } = reviseCanon(pkg, { kind: "location", locationId: id, patch: { lighting: "harsh noon sun" } });
    expect(locationReferenceSpec(revised, id).digest).not.toBe(before);
  });

  it("an unknown place or prop is an error, not a guess", () => {
    expect(() => locationReferenceSpec(mayaCoatFixture(), "loc_nowhere")).toThrow(WorldReferenceError);
    expect(() => propReferenceSpec(mayaCoatFixture(), "prop_nothing")).toThrow(WorldReferenceError);
  });
});
