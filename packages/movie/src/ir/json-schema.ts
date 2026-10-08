/**
 * The Film IR as JSON Schema, for structured-output tool definitions (the
 * planning model fills exactly this shape). Generated from the zod schema, so
 * the model's contract and CineForge's validator can never drift apart.
 *
 * Canon fields added in W3 have defaults so packages stored before them still
 * parse; the model, though, must state every field (an empty list or null is
 * an answer, an omission is not), so the model-facing schema requires every
 * property and drops the defaults.
 */
import { zodToJsonSchema } from "zod-to-json-schema";
import { FilmPackage } from "./schema";

let cached: Record<string, unknown> | null = null;

type Node = Record<string, unknown>;

function requireAll(node: unknown): void {
  if (Array.isArray(node)) return node.forEach(requireAll);
  if (!node || typeof node !== "object") return;
  const n = node as Node;
  delete n.default;
  if (n.properties && typeof n.properties === "object") n.required = Object.keys(n.properties as Node);
  for (const v of Object.values(n)) requireAll(v);
}

export function filmPackageJsonSchema(): Record<string, unknown> {
  if (cached) return cached;
  const s = zodToJsonSchema(FilmPackage, { target: "jsonSchema7", $refStrategy: "none" }) as Record<string, unknown>;
  delete s.$schema;
  requireAll(s);
  cached = s;
  return s;
}
