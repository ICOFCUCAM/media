/**
 * Claude provider — structured outputs (`output_config.format`, JSON Schema).
 *
 * Forced tool use is not used: Claude Opus 5.5 rejects `tool_choice` any/tool,
 * and structured outputs return schema-valid JSON directly. Long plans stream
 * (`.finalMessage()`), the system prompt is cached, and refusal / truncation
 * are reported as typed errors instead of being parsed as if complete.
 */
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { IntelligenceError, type IntelligenceProvider, type StructuredRequest, type StructuredResult } from "./types";

export class AnthropicProvider implements IntelligenceProvider {
  readonly id = "anthropic";
  private client: Anthropic | null = null;

  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  configured(): boolean {
    return Boolean(this.env.ANTHROPIC_API_KEY || this.env.ANTHROPIC_AUTH_TOKEN);
  }

  async generateStructured(req: StructuredRequest, model: string): Promise<StructuredResult> {
    if (!this.configured()) throw new IntelligenceError("PROVIDER_UNAVAILABLE", "Anthropic is not configured");
    this.client ??= new Anthropic();
    const started = Date.now();
    let message: Anthropic.Message;
    try {
      message = await this.client.messages
        .stream({
          model,
          max_tokens: req.maxTokens,
          system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
          output_config: {
            effort: req.effort ?? "high",
            // Removes constraints the API does not enforce (CineForge validates them after).
            format: jsonSchemaOutputFormat(req.schema as never),
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
    } catch (e) {
      if (e instanceof Anthropic.APIError) {
        throw new IntelligenceError("PROVIDER_ERROR", `Anthropic ${e.status ?? ""} ${e.message}`.trim(), { status: e.status });
      }
      throw new IntelligenceError("PROVIDER_ERROR", e instanceof Error ? e.message : String(e));
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
      output = JSON.parse(text);
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
}
