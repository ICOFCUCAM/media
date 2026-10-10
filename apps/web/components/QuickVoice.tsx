"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { getSupabase } from "../lib/supabase";
import { LANGUAGES } from "../lib/system";
import { QUICK_EMOTIONS, QUICK_STYLES, quickVoiceRow, type QuickChoice } from "../lib/quick-voice";

/**
 * The one simple voice screen (DirectorOS W26; Part 4 §176): voice, language,
 * style, emotion, speed, the text — Generate. It writes the same reading the
 * full Voice Studio below writes; everything underneath (the Voice API, the
 * router, engines, mastering) is the same.
 */
export function QuickVoice({ voices, onQueued }: { voices: { id: string; name: string }[]; onQueued: () => Promise<void> | void }) {
  const { user } = useAuth();
  const [c, setC] = useState<QuickChoice>({ voiceId: null, language: "en", style: "cinematic", emotion: "serious", speed: 1, text: "" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof QuickChoice>(k: K, v: QuickChoice[K]) => setC((x) => ({ ...x, [k]: v }));
  const voiceId = c.voiceId ?? voices[0]?.id ?? null;

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !user || busy || !c.text.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const ins = await sb.from("voiceovers").insert(quickVoiceRow(user.id, { ...c, voiceId }) as never);
      if (ins.error) throw new Error(ins.error.message);
      set("text", "");
      setNote({ ok: true, text: "Queued — it appears under Recordings when it is ready." });
      await onQueued();
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : "The voice could not be queued" });
    } finally {
      setBusy(false);
    }
  }

  const row = "grid grid-cols-[96px_1fr] items-center gap-3";
  return (
    <form onSubmit={generate} aria-labelledby="quick-voice" className="mb-10 max-w-xl border-t border-cf-fg pt-5">
      <h2 id="quick-voice" className="cf-label mb-5 text-cf-fg">Voice</h2>
      <div className="grid gap-3">
        <label className={row}>
          <span className="cf-label">Voice</span>
          <select className="cf-input py-2" value={voiceId ?? ""} onChange={(e) => set("voiceId", e.target.value || null)}>
            {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            <option value="">Built-in voice</option>
          </select>
        </label>
        <label className={row}>
          <span className="cf-label">Language</span>
          <select className="cf-input py-2" value={c.language} onChange={(e) => set("language", e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </label>
        <label className={row}>
          <span className="cf-label">Style</span>
          <select className="cf-input py-2" value={c.style} onChange={(e) => set("style", e.target.value as QuickChoice["style"])} title={QUICK_STYLES.find((s) => s.id === c.style)?.hint}>
            {QUICK_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className={row}>
          <span className="cf-label">Emotion</span>
          <select className="cf-input py-2" value={c.emotion} onChange={(e) => set("emotion", e.target.value as QuickChoice["emotion"])}>
            {QUICK_EMOTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label className={row}>
          <span className="cf-label">Speed</span>
          <span className="flex items-center gap-3">
            <input type="range" min={0.75} max={1.5} step={0.05} value={c.speed} onChange={(e) => set("speed", Number(e.target.value))} className="flex-1" aria-label="Speed" />
            <span className="w-10 text-right text-[13px] tabular-nums">{c.speed.toFixed(2)}</span>
          </span>
        </label>
        <textarea className="cf-input mt-2 resize-y" rows={4} value={c.text} onChange={(e) => set("text", e.target.value)} placeholder="What should the voice say?" aria-label="Text" required />
      </div>
      <button type="submit" className="cf-btn-ink mt-5 w-full" disabled={busy || !c.text.trim()}>{busy ? "Queuing…" : "Generate voice"}</button>
      {note && <p role={note.ok ? "status" : "alert"} className={`mt-3 text-[12px] ${note.ok ? "text-cf-muted" : "text-cf-danger"}`}>{note.text}</p>}
    </form>
  );
}
