/**
 * Translator (docs/29). Translates an ordered list of dialogue/narration lines
 * into a target language through the provider-neutral router (task
 * "translation", prompt translate.lines@1), as schema-shaped JSON.
 *
 * No silent degradation (DirectorOS DOS-75): when no model is configured, the
 * call fails or a line comes back empty, it throws TranslationError. Callers
 * skip that language and record TRANSLATION_FAILED.
 */
import { IntelligenceError, PROMPTS, type IntelligenceRouter } from "@cineforge/movie";
import { languageName } from "@cineforge/shared";
import { intelligence } from "../intelligence";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: { lines: { type: "array", items: { type: "string" } } },
};

export class TranslationError extends Error {
  constructor(readonly lang: string, readonly reason: string) {
    super(`translation to ${lang} failed: ${reason}`);
    this.name = "TranslationError";
  }
}

/** Translate `lines` into `lang` (a language code). Order + length preserved; throws TranslationError. */
export async function translateLines(
  lines: string[],
  lang: string,
  opts: { router?: IntelligenceRouter; projectId?: string } = {},
): Promise<string[]> {
  const src = lines.map((l) => l ?? "");
  if (src.length === 0) return src;
  if (lang === "en") return src;
  const router = opts.router ?? intelligence();
  if (!router.available("translation")) throw new TranslationError(lang, "no translation model configured");

  const p = PROMPTS.translateLines;
  let out: unknown;
  try {
    const res = await router.call(
      {
        task: "translation", promptId: p.id, promptVersion: p.version, system: p.system,
        user: JSON.stringify({ targetLanguage: `${languageName(lang)} (${lang})`, lines: src }),
        schema: SCHEMA, schemaName: "Translation", maxTokens: 16000, effort: "medium",
      },
      { projectId: opts.projectId },
    );
    out = (res.output as { lines?: unknown }).lines;
  } catch (err) {
    throw new TranslationError(lang, err instanceof IntelligenceError ? err.message : err instanceof Error ? err.message : String(err));
  }
  if (!Array.isArray(out)) throw new TranslationError(lang, "the model returned no translation");
  const missing = src.map((orig, i) => (orig.trim() && !(typeof out[i] === "string" && (out[i] as string).trim()) ? i : -1)).filter((i) => i >= 0);
  if (missing.length) throw new TranslationError(lang, `${missing.length} of ${src.length} lines came back empty`);
  return src.map((orig, i) => (orig.trim() ? (out[i] as string) : orig));
}
