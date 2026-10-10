import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { fixturePackage, FIXTURE_CONSTRAINTS as C } from "../ir/fixture";
import { filmPackageJsonSchema } from "../ir/json-schema";
import { OpenAIProvider } from "./openai";
import { normalizePlan, PlanInvalidError, planFilm } from "./planner";
import { renderPlanRequest } from "./prompts";
import { IntelligenceRouter, parseRoutes } from "./router";
import { IntelligenceError, type DecisionRecord, type IntelligenceProvider, type StructuredRequest } from "./types";

class FakeProvider implements IntelligenceProvider {
  calls: { req: StructuredRequest; model: string }[] = [];
  constructor(readonly id: string, private readonly replies: (unknown | Error)[], private readonly isConfigured = true) {}
  configured() { return this.isConfigured; }
  async generateStructured(req: StructuredRequest, model: string) {
    this.calls.push({ req, model });
    const r = this.replies.shift();
    if (r instanceof Error) throw r;
    return { output: r, provider: this.id, model, usage: { inputTokens: 10, outputTokens: 20 }, latencyMs: 5 };
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("routing (DOS-51/52/88)", () => {
  it("defaults every task to Claude Opus 5.5, or ANTHROPIC_MODEL", () => {
    expect(parseRoutes({}).film_plan).toEqual([{ provider: "anthropic", model: "claude-opus-5-5" }]);
    expect(parseRoutes({ ANTHROPIC_MODEL: "claude-opus-4-8" }).translation[0]!.model).toBe("claude-opus-4-8");
  });

  it("routes per task with an explicit, ordered fallback list", () => {
    const r = parseRoutes({ INTELLIGENCE_ROUTES: "film_plan=anthropic:claude-opus-5-5|openai:gpt-5; translation=openai:gpt-5-mini" });
    expect(r.film_plan).toEqual([{ provider: "anthropic", model: "claude-opus-5-5" }, { provider: "openai", model: "gpt-5" }]);
    expect(r.translation).toEqual([{ provider: "openai", model: "gpt-5-mini" }]);
    expect(() => parseRoutes({ INTELLIGENCE_ROUTES: "dance=anthropic:x" })).toThrow(/unknown task/);
  });

  it("tries the next route only when configured to, and logs every attempt", async () => {
    const decisions: DecisionRecord[] = [];
    const a = new FakeProvider("anthropic", [new IntelligenceError("REFUSED", "no")]);
    const o = new FakeProvider("openai", [{ ok: 1 }]);
    const router = new IntelligenceRouter([a, o], { INTELLIGENCE_ROUTES: "translation=anthropic:m1|openai:m2" }, (d) => { decisions.push(d); });
    const res = await router.call({ task: "translation", promptId: "t", promptVersion: 1, system: "s", user: "u", schema: {}, schemaName: "X", maxTokens: 10 }, { projectId: "p1" });
    expect(res.provider).toBe("openai");
    expect(decisions.map((d) => [d.attempt, d.provider, d.outcome, d.errorCode])).toEqual([[0, "anthropic", "error", "REFUSED"], [1, "openai", "ok", null]]);
    expect(decisions[1]!.inputSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(decisions[1]!.projectId).toBe("p1");
    expect(decisions[0]!.summary).toBe("REFUSED: no"); // the provider's reason is kept on a failed attempt
  });

  it("with no fallback configured, an unavailable provider is reported, never substituted", async () => {
    const router = new IntelligenceRouter([new FakeProvider("anthropic", [], false), new FakeProvider("openai", [{ ok: 1 }])], {});
    expect(router.available("film_plan")).toBe(false);
    await expect(
      router.call({ task: "film_plan", promptId: "p", promptVersion: 1, system: "", user: "", schema: {}, schemaName: "X", maxTokens: 1 }),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it("truncated output is not retried elsewhere (it is a budget problem, not a provider problem)", async () => {
    const router = new IntelligenceRouter(
      [new FakeProvider("anthropic", [new IntelligenceError("TRUNCATED", "max")]), new FakeProvider("openai", [{}])],
      { INTELLIGENCE_ROUTES: "film_plan=anthropic:a|openai:b" },
    );
    await expect(
      router.call({ task: "film_plan", promptId: "p", promptVersion: 1, system: "", user: "", schema: {}, schemaName: "X", maxTokens: 1 }),
    ).rejects.toMatchObject({ code: "TRUNCATED" });
  });
});

describe("One-Pass Intelligence (Part 2 §85, §93)", () => {
  it("a valid first plan needs exactly one call", async () => {
    const p = new FakeProvider("anthropic", [fixturePackage()]);
    const r = await planFilm(new IntelligenceRouter([p], {}), "a courier crosses a harbour", C);
    expect(p.calls).toHaveLength(1);
    expect(r.revised).toBe(false);
    expect(p.calls[0]!.req.promptId).toBe("director.master");
    expect(p.calls[0]!.req.user).toContain("exactly 2 scenes");
  });

  it("an invalid plan gets ONE surgical revision naming exactly its issues", async () => {
    const bad = fixturePackage();
    bad.scenes[0]!.locationId = "loc_moon";
    const p = new FakeProvider("anthropic", [bad, fixturePackage()]);
    const r = await planFilm(new IntelligenceRouter([p], {}), "brief", C);
    expect(p.calls).toHaveLength(2);
    expect(p.calls[1]!.req.task).toBe("film_plan_revision");
    expect(p.calls[1]!.req.user).toContain("location loc_moon does not exist");
    expect(r.revised).toBe(true);
    expect(r.fixedIssues.map((i) => i.code)).toEqual(["UNKNOWN_REFERENCE"]);
  });

  it("still invalid after the revision → PlanInvalidError, no third call", async () => {
    const bad = fixturePackage();
    bad.cast[0]!.role = "minor";
    const p = new FakeProvider("anthropic", [bad, bad, fixturePackage()]);
    await expect(planFilm(new IntelligenceRouter([p], {}), "brief", C)).rejects.toBeInstanceOf(PlanInvalidError);
    expect(p.calls).toHaveLength(2);
  });
});

describe("providers", () => {
  it("the Film IR schema is accepted by the SDK's structured-output transform", () => {
    const fmt = jsonSchemaOutputFormat(filmPackageJsonSchema() as never) as unknown as { type: string; schema: Record<string, unknown> };
    expect(fmt.type).toBe("json_schema");
    // Unsupported constraints move into descriptions; CineForge's validator enforces them after.
    expect(JSON.stringify(fmt.schema)).not.toContain('"minLength":');
    expect(JSON.stringify(fmt.schema)).not.toContain('"pattern":');
  });

  it("OpenAI: JSON-schema response format; refusal and truncation are typed", async () => {
    const replies = [
      { choices: [{ finish_reason: "stop", message: { content: '{"a":1}' } }], usage: { prompt_tokens: 3, completion_tokens: 4 }, model: "gpt-5" },
      { choices: [{ finish_reason: "stop", message: { content: null, refusal: "cannot" } }] },
      { choices: [{ finish_reason: "length", message: { content: "{" } }] },
    ];
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return Response.json(replies.shift());
    }) as unknown as typeof fetch;
    const p = new OpenAIProvider({ OPENAI_API_KEY: "k" }, fetchImpl);
    const req: StructuredRequest = { task: "translation", promptId: "t", promptVersion: 1, system: "s", user: "u", schema: { type: "object" }, schemaName: "T", maxTokens: 50 };
    expect((await p.generateStructured(req, "gpt-5")).output).toEqual({ a: 1 });
    expect((body.response_format as { type: string }).type).toBe("json_schema");
    await expect(p.generateStructured(req, "gpt-5")).rejects.toMatchObject({ code: "REFUSED" });
    await expect(p.generateStructured(req, "gpt-5")).rejects.toMatchObject({ code: "TRUNCATED" });
    expect(new OpenAIProvider({}).configured()).toBe(false);
  });

  it("OpenAI: images go before the text as data-URL image parts", async () => {
    let body: { messages: { content: unknown }[] } = { messages: [] };
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] });
    }) as unknown as typeof fetch;
    const req: StructuredRequest = {
      task: "visual_review", promptId: "v", promptVersion: 1, system: "s", user: "check", schema: { type: "object" },
      schemaName: "V", maxTokens: 50, images: [{ mediaType: "image/jpeg", data: "QUJD" }],
    };
    await new OpenAIProvider({ OPENAI_API_KEY: "k" }, fetchImpl).generateStructured(req, "gpt-5");
    expect(body.messages[1]!.content).toEqual([
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJD" } },
      { type: "text", text: "check" },
    ]);
  });
});

describe("one-scene productions (shorts)", () => {
  const one = { ...C, sceneCount: 1 };
  it("the plan request says a one-scene film has no setups; longer films are unchanged", () => {
    expect(renderPlanRequest("brief", one)).toContain("setups must be empty");
    expect(renderPlanRequest("brief", C)).not.toContain("setups must be empty");
  });

  it("setups are cleared from a one-scene plan before validation (a payoff needs a later scene)", () => {
    const plan = { scenes: [{ id: "scene_01" }], setups: [{ id: "setup_plate", plantedIn: "scene_01", paidOffIn: "scene_01" }] };
    expect((normalizePlan(plan, filmPackageJsonSchema(), one) as { setups: unknown[] }).setups).toEqual([]);
    expect((normalizePlan(plan, filmPackageJsonSchema(), C) as { setups: unknown[] }).setups).toHaveLength(1);
  });
});
