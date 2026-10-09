"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dependentShots, listEditRequests, loadCanon, requestEdit, type CanonCast, type EditRequestRow } from "../lib/production";
import { Status } from "./cf/primitives";

type Kind = "scene_wardrobe" | "wardrobe_description" | "physical";
const KIND_LABEL: Record<Kind, string> = {
  scene_wardrobe: "New outfit from a scene on",
  wardrobe_description: "Change an outfit everywhere",
  physical: "Visible state from a scene on (injury, wet, dirt…)",
};
const TONE = { pending: "idle", applying: "live", applied: "ok", rejected: "warn", failed: "danger" } as const;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "outfit";

/**
 * Edit command (DirectorOS W8b): ask for one canon change; the worker applies
 * it and regenerates only the shots that depend on it. A change that breaks
 * canon or touches a locked scene is refused with the reasons. Hidden for
 * films planned before the Film IR and before migration 0039.
 */
export function EditRequests({ projectId }: { projectId: string }) {
  const [canon, setCanon] = useState<CanonCast | null>(null);
  const [rows, setRows] = useState<EditRequestRow[]>([]);
  const [kind, setKind] = useState<Kind>("scene_wardrobe");
  const [characterId, setCharacterId] = useState("");
  const [sceneId, setSceneId] = useState("");
  const [wardrobeId, setWardrobeId] = useState("");
  const [text, setText] = useState("");
  const [touches, setTouches] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => listEditRequests(projectId).then(setRows), [projectId]);
  useEffect(() => {
    void loadCanon(projectId).then((c) => {
      setCanon(c);
      if (c?.characters[0]) setCharacterId(c.characters[0].id);
      if (c?.scenes[0]) setSceneId(c.scenes[0].id);
    });
    void refresh();
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, [projectId, refresh]);

  const character = useMemo(() => canon?.characters.find((c) => c.id === characterId), [canon, characterId]);
  useEffect(() => {
    setWardrobeId(character?.wardrobe[0]?.id ?? "");
  }, [character]);
  useEffect(() => {
    if (kind === "wardrobe_description" && wardrobeId) void dependentShots(projectId, "wardrobe", wardrobeId).then(setTouches);
    else setTouches(null);
  }, [kind, wardrobeId, projectId]);

  if (!canon) return null;

  function change(): Record<string, unknown> | null {
    const t = text.trim();
    if (kind === "scene_wardrobe") return t ? { kind, sceneId, characterId, wardrobe: { id: `wardrobe_${slug(t)}_${Math.random().toString(36).slice(2, 6)}`, description: t } } : null;
    if (kind === "wardrobe_description") return t && wardrobeId ? { kind, characterId, wardrobeId, description: t } : null;
    return { kind, sceneId, characterId, physical: t || null };
  }

  async function submit() {
    const c = change();
    if (!c) return;
    setBusy(true);
    setError(null);
    try {
      await requestEdit(projectId, c);
      setText("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the change");
    } finally {
      setBusy(false);
    }
  }

  const sel = "cf-input py-1.5 text-[13px]";
  return (
    <section aria-label="Change the film" className="mb-8 border-t border-cf-fg">
      <div className="border-b border-cf-line py-4">
        <span className="cf-label text-cf-fg">Change the film</span>
      </div>
      <div className="grid gap-3 border-b border-cf-line py-4 md:grid-cols-2">
        <select aria-label="Kind of change" value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={sel}>
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <select aria-label="Character" value={characterId} onChange={(e) => setCharacterId(e.target.value)} className={sel}>
          {canon.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {kind === "wardrobe_description" ? (
          <select aria-label="Outfit" value={wardrobeId} onChange={(e) => setWardrobeId(e.target.value)} className={sel}>
            {(character?.wardrobe ?? []).map((w) => <option key={w.id} value={w.id}>{w.description}</option>)}
          </select>
        ) : (
          <select aria-label="From scene" value={sceneId} onChange={(e) => setSceneId(e.target.value)} className={sel}>
            {canon.scenes.map((s) => <option key={s.id} value={s.id}>{`${String(s.index + 1).padStart(2, "0")} ${s.heading}`}</option>)}
          </select>
        )}
        <input
          aria-label="Description"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === "physical" ? "e.g. a cut above the left eye (empty clears it)" : "e.g. long blue wool coat"}
          className={sel}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cf-line py-3">
        <span className="text-[12px] text-cf-muted">
          {touches !== null ? `This outfit is in ${touches} shot${touches === 1 ? "" : "s"} — only those regenerate.` : "Only the shots this change touches regenerate."}
        </span>
        <button type="button" disabled={busy || !change()} onClick={() => void submit()} className="cf-btn-ink px-3 py-1.5">
          {busy ? "Sending…" : "Apply change"}
        </button>
      </div>
      {error && <p role="alert" className="border-b border-cf-line py-3 text-[12px] text-cf-danger">{error}</p>}
      <ol>
        {rows.map((r) => (
          <li key={r.id} className="grid gap-2 border-b border-cf-line py-3 md:grid-cols-[120px_1fr] md:items-baseline">
            <Status tone={TONE[r.status]}>{r.status}</Status>
            <p className="text-[13px] leading-relaxed">
              {KIND_LABEL[r.change.kind as Kind] ?? r.change.kind}
              {r.status === "applied" && <span className="ml-2 text-cf-muted">— {r.affected_shots ?? 0} shot(s) regenerating</span>}
              {r.status === "rejected" && <span className="ml-2 text-cf-muted">— {r.issues.map((i) => i.message).join("; ")}</span>}
              {r.status === "failed" && <span className="ml-2 text-cf-muted">— {r.error}</span>}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
