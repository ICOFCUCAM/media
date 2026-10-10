"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dependentShots, IDENTITY_FIELDS, listEditRequests, loadCanon, LOCATION_FIELDS, requestEdit,
  type CanonCast, type EditRequestRow, type IdentityField, type LocationField,
} from "../lib/production";
import { Status } from "./cf/primitives";

type Kind = "scene_wardrobe" | "wardrobe_description" | "physical" | "identity" | "location" | "prop";
const KIND_LABEL: Record<Kind, string> = {
  scene_wardrobe: "New outfit from a scene on",
  wardrobe_description: "Change an outfit everywhere",
  physical: "Visible state from a scene on (injury, wet, dirt…)",
  identity: "Change how a character looks (face, hair, build)",
  location: "Change a place",
  prop: "Change a prop",
};
const FIELD_LABEL: Record<IdentityField | LocationField | "name", string> = {
  face: "Face", hair: "Hair", body: "Build", description: "Description", architecture: "Architecture", era: "Era", lighting: "Light", name: "Name",
};
/** Which dependency edges a change touches (0041), for the "only these regenerate" count. */
const EDGE: Partial<Record<Kind, string>> = { wardrobe_description: "wardrobe", identity: "character", location: "location", prop: "prop" };
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
  const [locationId, setLocationId] = useState("");
  const [propId, setPropId] = useState("");
  const [field, setField] = useState<string>("face");
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
      if (c?.locations[0]) setLocationId(c.locations[0].id);
      if (c?.props[0]) setPropId(c.props[0].id);
    });
    void refresh();
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, [projectId, refresh]);

  const character = useMemo(() => canon?.characters.find((c) => c.id === characterId), [canon, characterId]);
  useEffect(() => {
    setWardrobeId(character?.wardrobe[0]?.id ?? "");
  }, [character]);
  // The field a kind edits; it starts from what the canon says now.
  useEffect(() => {
    setField(kind === "identity" ? "face" : kind === "location" ? "description" : kind === "prop" ? "description" : "");
  }, [kind]);
  const current = useMemo(() => {
    if (!canon) return "";
    if (kind === "identity") return character?.identity[field as IdentityField] ?? "";
    if (kind === "location") return canon.locations.find((l) => l.id === locationId)?.fields[field as LocationField] ?? "";
    if (kind === "prop") {
      const p = canon.props.find((x) => x.id === propId);
      return (field === "name" ? p?.name : p?.description) ?? "";
    }
    return "";
  }, [canon, kind, character, field, locationId, propId]);
  useEffect(() => {
    if (kind === "identity" || kind === "location" || kind === "prop") setText(current);
  }, [kind, current]);
  useEffect(() => {
    const edge = EDGE[kind];
    const key = kind === "wardrobe_description" ? wardrobeId : kind === "identity" ? characterId : kind === "location" ? locationId : kind === "prop" ? propId : "";
    if (edge && key) void dependentShots(projectId, edge, key).then(setTouches);
    else setTouches(null);
  }, [kind, wardrobeId, characterId, locationId, propId, projectId]);

  if (!canon) return null;

  function change(): Record<string, unknown> | null {
    const t = text.trim();
    if (kind === "scene_wardrobe") return t ? { kind, sceneId, characterId, wardrobe: { id: `wardrobe_${slug(t)}_${Math.random().toString(36).slice(2, 6)}`, description: t } } : null;
    if (kind === "wardrobe_description") return t && wardrobeId ? { kind, characterId, wardrobeId, description: t } : null;
    if (kind === "identity") return t && t !== current ? { kind, characterId, identity: { [field]: t } } : null;
    if (kind === "location") return t && t !== current && locationId ? { kind, locationId, patch: { [field]: t } } : null;
    if (kind === "prop") return t && t !== current && propId ? { kind, propId, patch: { [field]: t } } : null;
    return { kind, sceneId, characterId, physical: t || null };
  }
  const fields: readonly string[] = kind === "identity" ? IDENTITY_FIELDS : kind === "location" ? LOCATION_FIELDS : kind === "prop" ? ["name", "description"] : [];
  const kinds = (Object.keys(KIND_LABEL) as Kind[]).filter((k) => (k !== "location" || canon.locations.length) && (k !== "prop" || canon.props.length));

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
          {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        {kind === "location" ? (
          <select aria-label="Place" value={locationId} onChange={(e) => setLocationId(e.target.value)} className={sel}>
            {canon.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        ) : kind === "prop" ? (
          <select aria-label="Prop" value={propId} onChange={(e) => setPropId(e.target.value)} className={sel}>
            {canon.props.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <select aria-label="Character" value={characterId} onChange={(e) => setCharacterId(e.target.value)} className={sel}>
            {canon.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {fields.length ? (
          <select aria-label="What to change" value={field} onChange={(e) => setField(e.target.value)} className={sel}>
            {fields.map((f) => <option key={f} value={f}>{FIELD_LABEL[f as keyof typeof FIELD_LABEL]}</option>)}
          </select>
        ) : kind === "wardrobe_description" ? (
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
          placeholder={kind === "physical" ? "e.g. a cut above the left eye (empty clears it)" : fields.length ? "The new description" : "e.g. long blue wool coat"}
          className={sel}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cf-line py-3">
        <span className="text-[12px] text-cf-muted">
          {touches !== null ? `This is in ${touches} shot${touches === 1 ? "" : "s"} — only those regenerate.` : "Only the shots this change touches regenerate."}
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
