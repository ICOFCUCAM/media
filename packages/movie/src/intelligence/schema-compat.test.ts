import { describe, expect, it } from "vitest";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { zodToJsonSchema } from "zod-to-json-schema";
import { EDITOR_SCHEMA } from "../edit/review";
import { fixturePackage } from "../ir/fixture";
import { filmPackageJsonSchema } from "../ir/json-schema";
import { FilmPackage } from "../ir/schema";
import { VisualReviewOutput } from "../review/visual";
import { IntelligenceRouter } from "./router";
import { countUnionParameters, MAX_UNION_PARAMETERS, modelSafeSchema, restoreNulls } from "./schema-compat";
import type { IntelligenceProvider, StructuredRequest } from "./types";

/** What Anthropic actually receives: the SDK's transform of the model-safe schema. */
const sent = (s: Record<string, unknown>) => (jsonSchemaOutputFormat(modelSafeSchema(s) as never) as unknown as { schema: unknown }).schema;

describe("provider schema limits", () => {
  it("the raw Film IR schema is over Anthropic's union limit (the bug this guards)", () => {
    expect(countUnionParameters(filmPackageJsonSchema())).toBeGreaterThan(MAX_UNION_PARAMETERS);
  });

  it(`the Film IR schema sent to the model has at most ${MAX_UNION_PARAMETERS} union parameters`, () => {
    expect(countUnionParameters(modelSafeSchema(filmPackageJsonSchema()))).toBeLessThanOrEqual(MAX_UNION_PARAMETERS);
    expect(countUnionParameters(sent(filmPackageJsonSchema()))).toBeLessThanOrEqual(MAX_UNION_PARAMETERS);
  });

  it("every other model-facing schema is within the limit too", () => {
    const visual = zodToJsonSchema(VisualReviewOutput, { target: "jsonSchema7", $refStrategy: "none" }) as Record<string, unknown>;
    for (const s of [visual, EDITOR_SCHEMA as unknown as Record<string, unknown>]) {
      expect(countUnionParameters(sent(s))).toBeLessThanOrEqual(MAX_UNION_PARAMETERS);
    }
  });

  it("does not change the schema it is given", () => {
    const s = filmPackageJsonSchema();
    const before = JSON.stringify(s);
    modelSafeSchema(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("flattening and restoring", () => {
  const schema = {
    type: "object",
    properties: {
      name: { anyOf: [{ type: "string", minLength: 1, pattern: "^[a-z]+$" }, { type: "null" }] },
      mood: { anyOf: [{ type: "string", enum: ["calm", "tense"] }, { type: "null" }] },
      age: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
      note: { type: ["string", "null"] },
      who: { anyOf: [{ type: "string", pattern: "^char_[a-z0-9_]+$" }, { type: "string", const: "audience" }] },
      list: { type: "array", items: { anyOf: [{ type: "string" }, { type: "null" }] } },
    },
  };

  it("nullable scalars become plain types with a 'none' value; id unions become one pattern", () => {
    const f = modelSafeSchema(schema) as { properties: Record<string, Record<string, unknown>> };
    expect(countUnionParameters(f)).toBe(0);
    const p = f.properties;
    expect(p.name).toMatchObject({ type: "string", pattern: "^$|(?:^[a-z]+$)" });
    expect(p.name!.minLength).toBeUndefined();
    expect(p.mood!.enum).toEqual(["calm", "tense", ""]);
    expect(p.age).toMatchObject({ type: "integer", minimum: -1 });
    expect(p.note!.type).toBe("string");
    const re = new RegExp(p.who!.pattern as string);
    expect(["char_maya", "audience"].every((s) => re.test(s))).toBe(true);
    expect(["prop_x", "audiences", "Maya"].some((s) => re.test(s))).toBe(false);
  });

  it("restores null exactly where the original schema allowed it", () => {
    const answer = { name: "", mood: "", age: -1, note: "", who: "audience", list: ["", "a"] };
    expect(restoreNulls(answer, schema)).toEqual({ name: null, mood: null, age: null, note: null, who: "audience", list: [null, "a"] });
    expect(restoreNulls({ name: "maya", age: 0 }, schema)).toEqual({ name: "maya", age: 0 });
  });

  it("a film package survives the round trip: nulls → model sentinels → restored → valid", () => {
    const pkg = fixturePackage();
    const original = filmPackageJsonSchema();
    // What a model answering the flattened schema would send: every null as its sentinel.
    type N = { items?: N; properties?: Record<string, N>; anyOf?: N[] };
    const branch = (n: N) => n.anyOf?.find((b) => b.items || b.properties) ?? n;
    const toSentinels = (v: unknown, n: N): unknown => {
      if (v === null) return restoreNulls("", n) === null ? "" : restoreNulls(-1, n) === null ? -1 : null;
      if (Array.isArray(v)) return v.map((x) => toSentinels(x, branch(n).items ?? {}));
      if (v && typeof v === "object") {
        const props = branch(n).properties ?? {};
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toSentinels(x, props[k] ?? {})]));
      }
      return v;
    };
    const fromModel = toSentinels(JSON.parse(JSON.stringify(pkg)), original as N);
    expect(JSON.stringify(fromModel)).not.toEqual(JSON.stringify(pkg)); // the fixture has nulls to flatten
    const back = restoreNulls(fromModel, original);
    expect(back).toEqual(JSON.parse(JSON.stringify(pkg)));
    expect(FilmPackage.safeParse(back).success).toBe(true);
  });
});

describe("router", () => {
  it("sends the model-safe schema and hands back restored nulls", async () => {
    const calls: StructuredRequest[] = [];
    const provider: IntelligenceProvider = {
      id: "anthropic",
      configured: () => true,
      async generateStructured(req, model) {
        calls.push(req);
        return { output: { note: "" }, provider: "anthropic", model, usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1 };
      },
    };
    const schema = { type: "object", properties: { note: { anyOf: [{ type: "string" }, { type: "null" }] } } };
    const res = await new IntelligenceRouter([provider], {}).call({ task: "translation", promptId: "t", promptVersion: 1, system: "", user: "", schema, schemaName: "X", maxTokens: 1 });
    expect(countUnionParameters(calls[0]!.schema)).toBe(0);
    expect(res.output).toEqual({ note: null });
  });
});
