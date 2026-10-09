/**
 * Director workspace instructions (DirectorOS W9; Part 2 §91): the owner
 * writes in plain words; the intelligence layer reads it as at most ONE canon
 * change (the same kinds the edit command applies) plus a short reply. The
 * caller validates the change strictly before it becomes an edit request —
 * the model never edits anything itself.
 */
import type { FilmPackage } from "../ir/schema";
import { PROMPTS } from "./prompts";
import type { IntelligenceRouter } from "./router";

export interface Interpretation {
  /** change: one canon change · editorial: a cut/timing request for the Editor (W13) · none. */
  action: "change" | "editorial" | "none";
  /** Unvalidated: the caller checks it against the edit command's schema. */
  change: Record<string, unknown> | null;
  reply: string;
}

const STR = { type: "string" };
const SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["change", "editorial", "none"] },
    reply: { type: "string", description: "one or two plain sentences to the owner" },
    change: {
      type: ["object", "null"],
      properties: {
        kind: { type: "string", enum: ["scene_wardrobe", "wardrobe_description", "identity", "physical", "location", "prop"] },
        sceneId: STR, characterId: STR, wardrobeId: STR, locationId: STR, propId: STR, description: STR,
        wardrobe: { type: "object", properties: { id: STR, description: STR }, required: ["id", "description"] },
        physical: { type: ["string", "null"] },
        identity: { type: "object", properties: { face: STR, hair: STR, body: STR, marks: { type: "array", items: STR } } },
        age: { type: ["integer", "null"] },
        patch: { type: "object", properties: { description: STR, architecture: STR, era: STR, lighting: STR, name: STR } },
      },
      required: ["kind"],
    },
  },
  required: ["action", "reply", "change"],
};

/** The canon the model may refer to — ids and names only, small enough for any instruction. */
export function canonDigest(pkg: FilmPackage): Record<string, unknown> {
  return {
    cast: pkg.cast.map((c) => ({ id: c.id, name: c.name, age: c.age, wardrobe: c.wardrobe.map((w) => ({ id: w.id, description: w.description })) })),
    scenes: pkg.scenes.map((s, i) => ({
      id: s.id, number: i + 1, heading: s.heading, locationId: s.locationId,
      characters: s.characters.map((c) => ({ id: c.characterId, wardrobeId: c.wardrobeId, physical: c.physical })),
    })),
    locations: pkg.locations.map((l) => ({ id: l.id, name: l.name })),
    props: pkg.props.map((p) => ({ id: p.id, name: p.name })),
  };
}

/** Drop empty values the model may emit for fields of other kinds (the validator is strict). */
export function pruneChange(c: unknown): Record<string, unknown> | null {
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  const kind = (c as { kind?: unknown }).kind;
  // A null is meaningful only where it clears something: physical (an injury healed), identity age.
  const keepNull = new Set(kind === "physical" ? ["physical"] : kind === "identity" ? ["age"] : []);
  const prune = (o: Record<string, unknown>, top: boolean): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (v === undefined || v === "") continue;
      if (v === null) {
        if (top && keepNull.has(k)) out[k] = null;
        continue;
      }
      if (typeof v === "object" && !Array.isArray(v)) {
        const inner = prune(v as Record<string, unknown>, false);
        if (Object.keys(inner).length) out[k] = inner;
      } else out[k] = v;
    }
    return out;
  };
  return prune(c as Record<string, unknown>, true);
}

export async function interpretInstruction(
  router: IntelligenceRouter,
  pkg: FilmPackage,
  instruction: string,
  ctx: { projectId?: string | null } = {},
): Promise<Interpretation> {
  const p = PROMPTS.directorEdit;
  const res = await router.call({
    task: "edit_interpret", promptId: p.id, promptVersion: p.version, system: p.system,
    user: JSON.stringify({ instruction, canon: canonDigest(pkg) }),
    schema: SCHEMA, schemaName: "DirectorEdit", maxTokens: 2000, effort: "medium",
    summarize: (o) => {
      const r = o as Partial<Interpretation> | null;
      const as = r?.action === "change" ? `a ${(r.change as { kind?: string } | null)?.kind ?? "canon"} change` : r?.action === "editorial" ? "a request for the Editor" : "no canon change";
      return `Read "${instruction.slice(0, 120)}" as ${as}: ${r?.reply ?? ""}`;
    },
  }, ctx);
  const o = res.output as Partial<Interpretation>;
  const action = o.action === "change" ? "change" : o.action === "editorial" ? "editorial" : "none";
  return { action, change: action === "change" ? pruneChange(o.change) : null, reply: String(o.reply ?? "").slice(0, 1500) };
}
