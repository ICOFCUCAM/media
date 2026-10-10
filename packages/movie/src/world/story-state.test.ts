import { describe, expect, it } from "vitest";
import { fixturePackage } from "../ir/fixture";
import type { FilmPackage } from "../ir/schema";
import { validateCanon, validateFilmPackage } from "../ir/validate";
import { FIXTURE_CONSTRAINTS } from "../ir/fixture";
import { materializeWorld } from "./state";

const codes = (p: FilmPackage) => validateCanon(p).map((i) => `${i.stage}/${i.code}`);

/** The fixture plus a fact the audience only learns in scene two. */
function withSecret(): FilmPackage {
  const p = fixturePackage();
  p.facts.push({ id: "fact_ewan_owns_vault", statement: "Ewan owns the vault", knownAtStart: ["char_harbourmaster"] });
  p.scenes[1]!.reveals.push({ factId: "fact_ewan_owns_vault", to: ["char_maya", "audience"] });
  return p;
}

describe("goals in the film state (W24; Part 1 §92)", () => {
  it("the world state carries each goal's status scene by scene", () => {
    const w = materializeWorld(fixturePackage());
    expect(w.scenes[0]!.goals.goal_deliver_key).toMatchObject({ characterId: "char_maya", status: "advanced", changedIn: "scene_01" });
    expect(w.scenes[1]!.goals.goal_deliver_key).toMatchObject({ status: "achieved", changedIn: "scene_02" });
  });

  it("the fixture is valid with its goal", () => {
    expect(validateFilmPackage(fixturePackage(), FIXTURE_CONSTRAINTS).ok).toBe(true);
  });

  it("a goal cannot move after it is achieved; unknown goals and owners are refused", () => {
    const p = fixturePackage();
    p.scenes[0]!.goalChanges = [{ goalId: "goal_deliver_key", status: "achieved" }];
    p.scenes[1]!.goalChanges = [{ goalId: "goal_deliver_key", status: "blocked" }];
    const v = validateFilmPackage(p, FIXTURE_CONSTRAINTS);
    expect(v.ok ? [] : v.issues.map((i) => i.code)).toContain("GOAL_AFTER_END");
    const q = fixturePackage();
    q.goals[0]!.characterId = "char_nobody";
    q.scenes[0]!.goalChanges = [{ goalId: "goal_missing", status: "advanced" }];
    const r = validateFilmPackage(q, FIXTURE_CONSTRAINTS);
    expect(r.ok ? [] : r.issues.map((i) => i.path)).toEqual(expect.arrayContaining(["goals[0].characterId", "scenes[0].goalChanges[0].goalId"]));
  });
});

describe("audience devices (W24; Part 1 §57)", () => {
  it("dramatic irony holds when the audience knows and someone in the scene does not", () => {
    const p = withSecret();
    // The audience knows the key opens the vault; Ewan, in the scene, does not.
    p.scenes[0]!.devices = [{ kind: "dramatic_irony", factId: "fact_key_opens_vault", note: "Ewan jokes about the vault" }];
    expect(codes(p)).toEqual([]);
    // Nobody in scene two is unaware of the bridge: no irony there.
    p.scenes[1]!.devices = [{ kind: "dramatic_irony", factId: "fact_bridge_swings", note: "x" }];
    expect(codes(p)).toEqual(["canon/DEVICE_NO_IRONY"]);
  });

  it("misdirection leads away from a fact the audience learns later", () => {
    const p = withSecret();
    p.scenes[0]!.devices = [{ kind: "misdirection", factId: "fact_ewan_owns_vault", note: "Ewan acts like a stranger to the vault" }];
    expect(codes(p)).toEqual([]);
    // Misdirecting from what is never revealed, or already known, is refused.
    p.scenes[1]!.devices = [{ kind: "misdirection", factId: "fact_ewan_owns_vault", note: "x" }];
    expect(codes(p)).toEqual(["canon/DEVICE_MISDIRECTION_UNPAID"]);
  });

  it("a surprise is a fact the audience learns in that scene, not before", () => {
    const p = withSecret();
    p.scenes[1]!.devices = [{ kind: "surprise", factId: "fact_ewan_owns_vault", note: "Ewan opens the vault himself" }];
    expect(codes(p)).toEqual([]);
    p.scenes[1]!.devices = [{ kind: "surprise", factId: "fact_key_opens_vault", note: "x" }];
    expect(codes(p)).toEqual(["canon/DEVICE_SURPRISE_NOT_REVEALED"]);
  });
});
