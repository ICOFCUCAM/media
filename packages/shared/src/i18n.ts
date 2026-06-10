/**
 * Language registry for multilingual export (docs/29). Translation runs on the
 * Director model; per-language voice on the TTS provider. Pure + dependency-free
 * so both web and worker can share it.
 */
export interface Language {
  code: string; // BCP-47 base (ISO 639-1)
  name: string; // English display name
  native?: string;
}

export const LANGUAGES: Language[] = [
  { code: "en", name: "English", native: "English" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "sw", name: "Swahili", native: "Kiswahili" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "yo", name: "Yoruba", native: "Yorùbá" },
  { code: "no", name: "Norwegian", native: "Norsk" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "ig", name: "Igbo", native: "Igbo" },
  { code: "ln", name: "Lingala", native: "Lingála" },
  { code: "lg", name: "Luganda", native: "Luganda" },
  { code: "zu", name: "Zulu", native: "isiZulu" },
  { code: "pcm", name: "Nigerian Pidgin", native: "Naijá" },
];

const byCode = new Map(LANGUAGES.map((l) => [l.code, l]));

export function isLanguage(code: string): boolean {
  return byCode.has(code);
}

export function languageName(code: string): string {
  return byCode.get(code)?.name ?? code;
}

/** Parse a comma-separated language list (e.g. LOCALIZATION_LANGUAGES), keeping
 *  only known codes and de-duping; returns `fallback` if nothing valid remains. */
export function parseLanguages(csv: string | undefined, fallback: string[] = ["en"]): string[] {
  const out = [...new Set((csv ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(isLanguage))];
  return out.length ? out : fallback;
}
