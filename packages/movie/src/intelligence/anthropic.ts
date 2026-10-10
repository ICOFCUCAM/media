/**
 * Claude provider — structured outputs (`output_config.format`, JSON Schema).
 *
 * Forced tool use is not used: Claude Opus 5.5 rejects `tool_choice` any/tool,
 * and structured outputs return schema-valid JSON directly. Long plans stream
 * (`.finalMessage()`), the system prompt is cached, and refusal / truncation
 * are reported as typed errors instead of being parsed as if complete.
 *
 * Constrained decoding compiles the schema into a grammar, and the API refuses
 * one that is too large ("compiled grammar is too large") — the full Film IR is.
 * Such a schema is then sent in the system prompt instead and the reply parsed
 * as JSON; the router's callers validate every answer either way (CineForge's
 * validators and the planner's revise loop). The refusal is remembered per
 * schema, so later calls do not pay for a rejected request first.
 */
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { IntelligenceError, type IntelligenceProvider, type StructuredRequest, type StructuredResult } from "./types";

export class AnthropicProvider implements IntelligenceProvider {
  readonly id = "anthropic";
  private client: Anthropic | null;
  /** Schemas (by name) the API refused to compile; sent in the prompt instead. */
  private readonly unconstrained = new Set<string>();

  constructor(private readonly env: Record<string, string | undefined> = process.env, client?: Anthropic) {
    this.client = client ?? null;
  }

  configured(): boolean {
    return Boolean(this.client || this.env.ANTHROPIC_API_KEY || this.env.ANTHROPIC_AUTH_TOKEN);
  }

  async generateStructured(req: StructuredRequest, model: string): Promise<StructuredResult> {
    if (!this.configured()) throw new IntelligenceError("PROVIDER_UNAVAILABLE", "Anthropic is not configured");
    this.client ??= new Anthropic();
    const started = Date.now();
    let message: Anthropic.Message;
    try {
      message = await this.send(req, model, !this.unconstrained.has(req.schemaName));
    } catch (e) {
      if (!isGrammarTooLarge(e)) throw toIntelligenceError(e);
      this.unconstrained.add(req.schemaName);
      console.warn(JSON.stringify({ event: "ai.schema_unconstrained", schemaName: req.schemaName, model }));
      try {
        message = await this.send(req, model, false);
      } catch (e2) {
        throw toIntelligenceError(e2);
      }
    }
    if (message.stop_reason === "refusal") {
      throw new IntelligenceError("REFUSED", "the model declined the request", {
        category: message.stop_details?.category ?? null,
      });
    }
    if (message.stop_reason === "max_tokens") {
      throw new IntelligenceError("TRUNCATED", `output hit max_tokens (${req.maxTokens})`);
    }
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let output: unknown;
    try {
      output = parseJson(text);
    } catch {
      throw new IntelligenceError("NO_STRUCTURED_OUTPUT", "the response was not valid JSON");
    }
    return {
      output,
      provider: this.id,
      model: message.model,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? undefined,
      },
      latencyMs: Date.now() - started,
    };
  }

  private send(req: StructuredRequest, model: string, constrained: boolean): Promise<Anthropic.Message> {
    const system = constrained
      ? req.system
      : `${req.system}\n\nRespond with only one JSON object (no prose, no code fence) that conforms to this JSON Schema (${req.schemaName}):\n${JSON.stringify(req.schema)}`;
    return this.client!.messages
      .stream({
        model,
        max_tokens: req.maxTokens,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        output_config: {
          effort: req.effort ?? "high",
          // Removes constraints the API does not enforce (CineForge validates them after).
          ...(constrained ? { format: jsonSchemaOutputFormat(req.schema as never) } : {}),
        },
        messages: [{
          role: "user",
          content: req.images?.length
            ? [
                ...req.images.map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.mediaType, data: i.data } })),
                { type: "text" as const, text: req.user },
              ]
            : req.user,
        }],
      })
      .finalMessage();
  }
}

function isGrammarTooLarge(e: unknown): boolean {
  return e instanceof Anthropic.APIError && e.status === 400 && /grammar is too large/i.test(e.message);
}

function toIntelligenceError(e: unknown): IntelligenceError {
  if (e instanceof Anthropic.APIError) {
    return new IntelligenceError("PROVIDER_ERROR", `Anthropic ${e.status ?? ""} ${e.message}`.trim(), { status: e.status });
  }
  return new IntelligenceError("PROVIDER_ERROR", e instanceof Error ? e.message : String(e));
}

/** The JSON object in a reply; tolerates a code fence or a sentence around it when unconstrained. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const from = text.indexOf("{");
    const to = text.lastIndexOf("}");
    if (from < 0 || to <= from) throw new SyntaxError("no JSON object");
    return JSON.parse(text.slice(from, to + 1));
  }
}
