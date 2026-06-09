/**
 * Translator (docs/29). Translates an ordered list of dialogue/narration lines
 * into a target language using the Director model (Anthropic) via forced tool
 * use, so the output is a schema-shaped array — no JSON scraping. Falls back to
 * returning the originals unchanged when ANTHROPIC_API_KEY is unset or the call
 * fails, so localization never hard-stops the pipeline.
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

/** Translate `lines` into `lang` (a language code). Order + length preserved. */
export async function translateLines(lines: string[], lang: string): Promise<string[]> {
  const src = lines.map((l) => l ?? "");
  if (src.length === 0) return src;
  if (lang === "en" || !process.env.ANTHROPIC_API_KEY) return src;

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
    if (Array.isArray(out)) {
      // Pad/truncate to the source length so callers can zip 1:1.
      return src.map((orig, i) => (typeof out[i] === "string" && (out[i] as string).trim() ? (out[i] as string) : orig));
    }
    return src;
  } catch (err) {
    console.error(`[translate] ${lang} failed, keeping originals:`, err);
    return src;
  }
}
