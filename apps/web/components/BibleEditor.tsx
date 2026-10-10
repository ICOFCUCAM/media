"use client";

import { useState } from "react";
import { requestEdit } from "../lib/production";
import { biblePatch, type BibleFilm } from "../lib/workspace";

const STORY: { key: "logline" | "synopsis" | "genre" | "tone" | "premise" | "audience" | "era" | "geography"; label: string; long?: boolean }[] = [
  { key: "logline", label: "Logline" },
  { key: "synopsis", label: "Synopsis", long: true },
  { key: "premise", label: "Premise", long: true },
  { key: "genre", label: "Genre" },
  { key: "tone", label: "Tone" },
  { key: "audience", label: "Audience" },
  { key: "era", label: "Era" },
  { key: "geography", label: "Where" },
];
const LOOK: { key: keyof BibleFilm["visualStyle"]; label: string }[] = [
  { key: "palette", label: "Palette" }, { key: "lighting", label: "Light" }, { key: "lensLanguage", label: "Lenses" }, { key: "texture", label: "Texture" },
];
const SOUND: { key: keyof BibleFilm["audioStyle"]; label: string }[] = [{ key: "score", label: "Score" }, { key: "ambience", label: "Ambience" }];

/**
 * The Film Bible, edited in the workspace (W27). Saving sends one
 * `film_bible` canon change through the edit requests: it passes canon,
 * locks and passes like any change, and only what it touches is made again —
 * a new look regenerates the shots, a new score style recomposes the score,
 * a new ambience redraws the beds; story text changes no media.
 */
export function BibleEditor({ projectId, film, onDone }: { projectId: string; film: BibleFilm; onDone: () => void }) {
  const [draft, setDraft] = useState<BibleFilm>(() => structuredClone(film));
  const [themes, setThemes] = useState(film.themes.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const after: BibleFilm = { ...draft, themes: themes.split(",") };
  const patch = biblePatch(film, after);
  const regenerates = Boolean(patch && "visualStyle" in patch);

  async function save() {
    if (!patch) return;
    setBusy(true);
    setError(null);
    try {
      await requestEdit(projectId, { kind: "film_bible", patch });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the bible");
    } finally {
      setBusy(false);
    }
  }

  const field = "cf-input mt-1 w-full py-1.5 text-[12px]";
  return (
    <div className="space-y-4">
      {STORY.map((f) => (
        <label key={f.key} className="block">
          <span className="cf-label">{f.label}</span>
          {f.long ? (
            <textarea rows={3} value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} className={field} />
          ) : (
            <input value={draft[f.key]} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} className={field} />
          )}
        </label>
      ))}
      <label className="block">
        <span className="cf-label">Themes (comma-separated)</span>
        <input value={themes} onChange={(e) => setThemes(e.target.value)} className={field} />
      </label>
      <fieldset>
        <legend className="cf-label mb-1">Look</legend>
        {LOOK.map((f) => (
          <label key={f.key} className="mb-2 block text-[11px] text-cf-muted">
            {f.label}
            <input value={draft.visualStyle[f.key]} onChange={(e) => setDraft({ ...draft, visualStyle: { ...draft.visualStyle, [f.key]: e.target.value } })} className={field} />
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend className="cf-label mb-1">Sound</legend>
        {SOUND.map((f) => (
          <label key={f.key} className="mb-2 block text-[11px] text-cf-muted">
            {f.label}
            <input value={draft.audioStyle[f.key]} onChange={(e) => setDraft({ ...draft, audioStyle: { ...draft.audioStyle, [f.key]: e.target.value } })} className={field} />
          </label>
        ))}
      </fieldset>
      <p className="text-[11px] text-cf-muted">
        {!patch ? "Nothing changed yet." : regenerates ? "A new look is in every shot: the shots it changes are made again." : "Only what this touches is made again."}
      </p>
      {error && <p role="alert" className="text-[12px] text-cf-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy || !patch} onClick={() => void save()} className="cf-btn-ink px-3 py-1.5">{busy ? "Saving…" : "Save bible"}</button>
        <button type="button" onClick={onDone} className="cf-btn-line px-3 py-1.5">Cancel</button>
      </div>
    </div>
  );
}
