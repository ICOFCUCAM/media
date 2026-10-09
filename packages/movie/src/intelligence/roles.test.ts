import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PROMPTS } from "./prompts";
import { DIRECTORIAL_ROLES, roleOfPrompt } from "./roles";

describe("the directorial roles (Part 1 §26–28)", () => {
  it("are the six §27.2 starts with — not twenty", () => {
    expect(DIRECTORIAL_ROLES.map((r) => r.label)).toEqual(["Director", "Story / Screenplay", "Visual / Cinematography", "Audio", "Continuity", "Editor / QC"]);
  });

  it("every registered prompt belongs to exactly one role", () => {
    for (const p of Object.values(PROMPTS)) {
      expect(DIRECTORIAL_ROLES.filter((r) => r.prompts.includes(p.id)), p.id).toHaveLength(1);
    }
    expect(roleOfPrompt("editor.review")?.id).toBe("editor_qc");
    expect(roleOfPrompt("nope")).toBeNull();
  });

  it("every role is carried by code that exists", () => {
    const root = resolve(__dirname, "../../../..");
    for (const r of DIRECTORIAL_ROLES) {
      expect(r.prompts.length + r.engines.length, r.id).toBeGreaterThan(0);
      for (const e of r.engines) expect(existsSync(resolve(root, e.split(" ")[0]!)), e).toBe(true);
    }
  });
});
