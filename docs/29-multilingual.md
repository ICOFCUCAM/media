# 29 — Multilingual export

One film → many languages. A creator authors once; the platform produces a
language variant (translated dialogue/narration, a subtitle track, and optionally
re-dubbed audio) per target language, ready to download or push to social.

## Pipeline

```
scene dialogue / narration ─► translate (Director model)
        │                          │
        │                          ├─► subtitle track per language (.srt/.vtt) ─► muxed into the render
        │                          └─► TTS per language (OpenAI / ElevenLabs) ─► re-dubbed audio (optional)
        ▼
  one render variant per language (or one render + switchable soft-subtitle tracks)
```

## What's built

- **Language registry** — `LANGUAGES` + `parseLanguages` / `languageName`
  (`packages/shared/src/i18n.ts`), driven by `LOCALIZATION_LANGUAGES`.
- **Subtitle builders** — `buildSrt` / `buildVtt` / `cuesFromLines`
  (`packages/shared/src/subtitles.ts`, pure + tested). The render engine already
  muxes a soft subtitle track (`mov_text`, `apps/worker/src/ffmpeg/commands.ts`),
  and `scenes.subtitle_key` exists to store it.

## What's next (integration points)

- **Translator** — a Director-model call (`director/translate.ts`, forced-tool
  structured output) that returns translated dialogue/narration per language,
  with a deterministic pass-through fallback.
- **`localize` queue** — translate a project's scenes into the requested
  languages, build per-language subtitle assets, and (when
  `LOCALIZATION_TTS_PROVIDER` is set) re-dub narration via OpenAI TTS / ElevenLabs.
- **Export** — a render variant per language, or one render with switchable
  soft-subtitle tracks the player/downloader can select.

## Config

`LOCALIZATION_LANGUAGES` (offered set), `LOCALIZATION_TTS_PROVIDER`
(`openai` | `elevenlabs`), `ELEVENLABS_API_KEY` for cloned-voice dubbing.
Translation reuses `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`.
