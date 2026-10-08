/**
 * Translator (docs/29). Translates an ordered list of dialogue/narration lines
 * into a target language using the Director model (Anthropic) via forced tool
 * use, so the output is a schema-shaped array — no JSON scraping.
 *
 * No silent degradation (DirectorOS DOS-75): when no model is configured, the
 * call fails or a line comes back empty, it throws TranslationError. It used
 * to return the English originals, which were then stored and served as the
 * target language. Callers skip that language and record TRANSLATION_FAILED.
 */
import Anthropic from "@anthropic-ai/sdk";
import { languageName } from "@cineforge/shared";

const TOOL = "submit_translation";
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: {
    lines: { type: "array", items: { type: "string" } },
  },
} as const;

export class TranslationError extends Error {
  constructor(readonly lang: string, readonly reason: string) {
    super(`translation to ${lang} failed: ${reason}`);
    this.name = "TranslationError";
  }
}

/** Translate `lines` into `lang` (a language code). Order + length preserved; throws TranslationError. */
export async function translateLines(lines: string[], lang: string): Promise<string[]> {
  const src = lines.map((l) => l ?? "");
  if (src.length === 0) return src;
  if (lang === "en") return src;
  if (!process.env.ANTHROPIC_API_KEY) throw new TranslationError(lang, "no translation model configured");

  const name = languageName(lang);
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
      max_tokens: 8000,
      system: [
        `You are a professional film translator. Translate each line into ${name} (${lang}),`,
        "preserving tone, register and meaning for spoken dialogue/voiceover.",
        "Return EXACTLY one translated string per input line, in the same order, via submit_translation.",
      ].join(" "),
      tools: [{ name: TOOL, description: `Return the ${name} translations.`, input_schema: SCHEMA as unknown as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: TOOL },
      messages: [{ role: "user", content: JSON.stringify({ lines: src }) }],
    });
    const toolUse = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL);
    const out = toolUse?.input && typeof toolUse.input === "object" ? (toolUse.input as { lines?: unknown }).lines : undefined;
    if (!Array.isArray(out)) throw new TranslationError(lang, "the model returned no translation");
    const missing = src.map((orig, i) => (orig.trim() && !(typeof out[i] === "string" && (out[i] as string).trim()) ? i : -1)).filter((i) => i >= 0);
    if (missing.length) throw new TranslationError(lang, `${missing.length} of ${src.length} lines came back empty`);
    return src.map((orig, i) => (orig.trim() ? (out[i] as string) : orig));
  } catch (err) {
    if (err instanceof TranslationError) throw err;
    throw new TranslationError(lang, err instanceof Error ? err.message : String(err));
  }
}
