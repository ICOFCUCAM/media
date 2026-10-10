import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One Continuity Engine (W27): the web storyboard keeps a client-safe copy of
 * this module (the package barrel is not browser-safe). The copy must be this
 * file exactly, below its three-line note, so the two never drift again.
 */
describe("the web storyboard's continuity copy", () => {
  it("is identical to the worker's engine", () => {
    const here = readFileSync(join(__dirname, "continuity.ts"), "utf8");
    const web = readFileSync(join(__dirname, "../../../apps/web/lib/continuity.ts"), "utf8");
    expect(web.split("\n").slice(3).join("\n")).toBe(here);
  });
});
