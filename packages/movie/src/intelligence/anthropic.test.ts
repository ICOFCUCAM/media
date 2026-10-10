import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicProvider, parseJson } from "./anthropic";
import type { StructuredRequest } from "./types";

const TOO_LARGE = { type: "error", error: { type: "invalid_request_error", message: "The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools." } };

function fakeClient(replies: (string | Error)[]) {
  const bodies: Record<string, unknown>[] = [];
  const client = {
    messages: {
      stream(body: Record<string, unknown>) {
        bodies.push(body);
        const r = replies.shift();
        return {
          async finalMessage() {
            if (r instanceof Error) throw r;
            return { model: "m", stop_reason: "end_turn", content: [{ type: "text", text: r }], usage: { input_tokens: 1, output_tokens: 1 } };
          },
        };
      },
    },
  } as unknown as Anthropic;
  return { client, bodies };
}

const tooLarge = () => new Anthropic.BadRequestError(400, TOO_LARGE, undefined, new Headers());
const req: StructuredRequest = {
  task: "film_plan", promptId: "p", promptVersion: 1, system: "SYS", user: "brief",
  schema: { type: "object", properties: { a: { type: "integer" } } }, schemaName: "FilmPackage", maxTokens: 100,
};

describe("Anthropic provider: schema too large for constrained decoding", () => {
  it("retries with the schema in the prompt, then skips the constrained attempt for that schema", async () => {
    const { client, bodies } = fakeClient([tooLarge(), '{"a":1}', '```json\n{"a":2}\n```']);
    const p = new AnthropicProvider({}, client);
    expect((await p.generateStructured(req, "m")).output).toEqual({ a: 1 });
    expect((bodies[0]!.output_config as { format?: unknown }).format).toBeDefined();
    expect((bodies[1]!.output_config as { format?: unknown }).format).toBeUndefined();
    expect(JSON.stringify(bodies[1]!.system)).toContain("FilmPackage");
    expect((await p.generateStructured(req, "m")).output).toEqual({ a: 2 });
    expect(bodies).toHaveLength(3);
    expect((bodies[2]!.output_config as { format?: unknown }).format).toBeUndefined();
  });

  it("other API errors are reported, not retried", async () => {
    const other = new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "bad model" } }, undefined, new Headers());
    const { client, bodies } = fakeClient([other]);
    await expect(new AnthropicProvider({}, client).generateStructured(req, "m")).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    expect(bodies).toHaveLength(1);
  });

  it("parses a JSON object with prose or a fence around it", () => {
    expect(parseJson('{"x":1}')).toEqual({ x: 1 });
    expect(parseJson('Here it is:\n```json\n{"x":{"y":[1]}}\n```')).toEqual({ x: { y: [1] } });
    expect(() => parseJson("no json")).toThrow();
  });
});
