/**
 * OpenAI provider — Chat Completions with a JSON-Schema response format.
 * Optional: used only when a route names it (INTELLIGENCE_ROUTES). The schema
 * is sent non-strict (the IR uses constraints strict mode rejects); CineForge's
 * validator enforces the full contract afterwards.
 */
import { IntelligenceError, type IntelligenceProvider, type StructuredRequest, type StructuredResult } from "./types";

export class OpenAIProvider implements IntelligenceProvider {
  readonly id = "openai";

  constructor(
    private readonly env: Record<string, string | undefined> = process.env,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  configured(): boolean {
    return Boolean(this.env.OPENAI_API_KEY);
  }

  async generateStructured(req: StructuredRequest, model: string): Promise<StructuredResult> {
    if (!this.configured()) throw new IntelligenceError("PROVIDER_UNAVAILABLE", "OpenAI is not configured");
    const base = (this.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const started = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model,
          max_completion_tokens: req.maxTokens,
          messages: [
            { role: "system", content: req.system },
            {
              role: "user",
              content: req.images?.length
                ? [
                    ...req.images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mediaType};base64,${i.data}` } })),
                    { type: "text", text: req.user },
                  ]
                : req.user,
            },
          ],
          response_format: { type: "json_schema", json_schema: { name: req.schemaName, schema: req.schema, strict: false } },
        }),
      });
    } catch (e) {
      throw new IntelligenceError("PROVIDER_ERROR", e instanceof Error ? e.message : String(e));
    }
    if (!res.ok) throw new IntelligenceError("PROVIDER_ERROR", `OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`, { status: res.status });
    const data = (await res.json()) as {
      model?: string;
      choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = data.choices?.[0];
    if (choice?.message?.refusal) throw new IntelligenceError("REFUSED", choice.message.refusal.slice(0, 300));
    if (choice?.finish_reason === "length") throw new IntelligenceError("TRUNCATED", `output hit max tokens (${req.maxTokens})`);
    let output: unknown;
    try {
      output = JSON.parse(choice?.message?.content ?? "");
    } catch {
      throw new IntelligenceError("NO_STRUCTURED_OUTPUT", "the response was not valid JSON");
    }
    return {
      output,
      provider: this.id,
      model: data.model ?? model,
      usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
      latencyMs: Date.now() - started,
    };
  }
}
