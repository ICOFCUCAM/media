import { describe, expect, it } from "vitest";
import { planCapSec, PLAN_MAX_FILM_SEC } from "./plans";

describe("planCapSec", () => {
  it("returns each tier's ceiling", () => {
    expect(planCapSec("FREE")).toBe(30);
    expect(planCapSec("CREATOR")).toBe(180);
    expect(planCapSec("STUDIO")).toBe(600);
    expect(planCapSec("AGENCY")).toBe(1200);
    expect(planCapSec("ENTERPRISE")).toBe(PLAN_MAX_FILM_SEC.ENTERPRISE);
  });
  it("leaves admins uncapped", () => {
    expect(planCapSec("FREE", "ADMIN")).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("falls back to the Free ceiling for an unknown tier", () => {
    expect(planCapSec("MYSTERY", "USER")).toBe(30);
  });
});
