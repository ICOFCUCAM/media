/**
 * The Film IR as JSON Schema, for structured-output tool definitions (the
 * planning model fills exactly this shape). Generated from the zod schema, so
 * the model's contract and CineForge's validator can never drift apart.
 */
import { zodToJsonSchema } from "zod-to-json-schema";
import { FilmPackage } from "./schema";

let cached: Record<string, unknown> | null = null;

export function filmPackageJsonSchema(): Record<string, unknown> {
  if (cached) return cached;
  const s = zodToJsonSchema(FilmPackage, { target: "jsonSchema7", $refStrategy: "none" }) as Record<string, unknown>;
  delete s.$schema;
  cached = s;
  return s;
}
