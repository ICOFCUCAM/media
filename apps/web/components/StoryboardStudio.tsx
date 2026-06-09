"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmtDuration } from "../lib/system";
import {
  draftScenesFromBrief,
  newDraft,
  createStoryboardProject,
  persistScene,
  uploadSeedImage,
  subscribeScenes,
  generateScene,
  assembleStoryboard,
  type SceneDraft,
} from "../lib/storyboard";
import type { ShotSource } from "../lib/database.types";
import { listAnchors } from "../lib/library";
import { useAuth } from "./AuthProvider";

const SCENE_COUNTS = [3, 4, 5, 6, 8];
const CLIP_DURATIONS = [5, 10];

/**
 * Scene-by-scene authoring. Each card is an independent unit of work: the
 * creator writes the script, picks Text→Video or Image→Video (uploading,
 * generating or referencing a seed frame), and generates/retries that clip
 * alone. Per-scene status streams back over Supabase Realtime — the same
 * job-per-artifact model, on our own Wan/Hunyuan pipeline.
 */
export interface StoryboardStudioProps {
  initialBrief?: string;
  initialScenes?: SceneDraft[];
  defaultSource?: ShotSource;
  intro?: ReactNode;
}

export function StoryboardStudio({ initialBrief, initialScenes, defaultSource = "text", intro }: StoryboardStudioProps = {}) {
  const [brief, setBrief] = useState(
    initialBrief ?? "A neon-noir detective story set in a rain-soaked megacity where memories can be stolen.",
  );
  const [count, setCount] = useState(4);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [scenes, setScenes] = useState<SceneDraft[]>(() =>
    (initialScenes ?? []).map((s) => ({ ...s, source: s.source ?? defaultSource })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assembled, setAssembled] = useState(false);
  const cancelers = useRef<Map<string, { cancel: () => void }>>(new Map());
  const channelRef = useRef<{ unsubscribe: () => void } | null>(null);

  // Live = persist to Supabase + Realtime. Otherwise everything runs locally as
  // a preview (no account needed) so the full flow is usable on the deploy.
  const { enabled, user } = useAuth();
  const live = enabled && !!user;

  const totalSeconds = useMemo(() => scenes.reduce((s, d) => s + d.durationSec, 0), [scenes]);
  const allReady = scenes.length > 0 && scenes.every((s) => s.status === "READY");
  const persisted = Boolean(projectId);

  useEffect(() => {
    return () => {
      cancelers.current.forEach((c) => c.cancel());
      channelRef.current?.unsubscribe();
    };
  }, []);

  function patch(key: string, p: Partial<SceneDraft>) {
    setScenes((prev) => prev.map((s) => (s.key === key ? { ...s, ...p } : s)));
  }

  /** Subscribe once we have a project: map live scene status onto the cards. */
  function attachRealtime(id: string) {
    channelRef.current?.unsubscribe();
    channelRef.current = subscribeScenes(id, (row) => {
      setScenes((prev) => prev.map((s) => (s.sceneId === row.id ? { ...s, status: row.status } : s)));
    });
  }

  /**
   * Deferred project creation: scenes are composed locally first, and the
   * project + scene/shot rows are only written to Supabase the moment a
   * persisting action (generate, upload, assemble) happens.
   */
  async function ensureStarted(list = scenes): Promise<{ id: string; scenes: SceneDraft[] }> {
    if (projectId) return { id: projectId, scenes: list };
    // Preview: assign local ids, no database.
    if (!live) {
      const out = list.map((d) => ({ ...d, sceneId: d.sceneId ?? `local_${d.key}`, shotId: d.shotId ?? `local_${d.key}` }));
      setProjectId("preview");
      setScenes(out);
      return { id: "preview", scenes: out };
    }
    setBusy(true);
    setError(null);
    try {
      const id = await createStoryboardProject({ title: brief, brief, totalSeconds: totalSeconds || 20 });
      setProjectId(id);
      attachRealtime(id);
      const out: SceneDraft[] = [];
      for (const d of list) {
        const { sceneId, shotId } = await persistScene(id, d);
        out.push({ ...d, sceneId, shotId });
      }
      setScenes(out);
      return { id, scenes: out };
    } finally {
      setBusy(false);
    }
  }

  function loadDrafts(list: SceneDraft[]) {
    cancelers.current.forEach((c) => c.cancel());
    cancelers.current.clear();
    channelRef.current?.unsubscribe();
    setProjectId(null);
    setAssembled(false);
    setScenes(list);
  }

  async function onSaveScene(key: string) {
    if (!live || !projectId) return; // local-only in preview / until started
    const d = scenes.find((s) => s.key === key);
    if (!d) return;
    try {
      const { sceneId, shotId } = await persistScene(projectId, d);
      patch(key, { sceneId, shotId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  function onAddScene() {
    setScenes((prev) => [...prev, { ...newDraft(prev.length), source: defaultSource }]);
  }

  async function onUpload(key: string, file: File) {
    patch(key, { source: "image" });
    // Preview: show the image locally via an object URL (no upload).
    if (!live) {
      patch(key, { seedKey: `local:${key}`, seedUrl: URL.createObjectURL(file), source: "image" });
      return;
    }
    try {
      const { id } = await ensureStarted();
      const { key: seedKey, url } = await uploadSeedImage(id, key, file);
      patch(key, { seedKey, seedUrl: url, source: "image" });
      await onSaveScene(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  function onGenerateImage(key: string) {
    // Labeled stub — no image provider wired yet. Records an image source with a
    // synthetic seed so the image→video path is exercised end to end.
    patch(key, { source: "image", seedKey: `generated:${key}`, seedUrl: null });
    onSaveScene(key);
  }

  function startGen(d: SceneDraft) {
    if (!d.sceneId || !d.shotId) return;
    cancelers.current.get(d.key)?.cancel();
    patch(d.key, { status: "GENERATING" });
    if (live) {
      // Worker writes status → Realtime → UI.
      cancelers.current.set(d.key, generateScene(d.sceneId, d.shotId));
    } else {
      // Preview: simulate the render locally.
      const t = setTimeout(() => patch(d.key, { status: "READY" }), 1400 + Math.random() * 1200);
      cancelers.current.set(d.key, { cancel: () => clearTimeout(t) });
    }
  }

  async function onGenerate(key: string) {
    try {
      const { scenes: list } = await ensureStarted();
      const d = list.find((s) => s.key === key);
      if (d) startGen(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    }
  }

  async function onGenerateAll() {
    try {
      const { scenes: list } = await ensureStarted();
      list.forEach((s) => s.status !== "READY" && startGen(s));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    }
  }

  function onRemove(key: string) {
    cancelers.current.get(key)?.cancel();
    setScenes((prev) => prev.filter((s) => s.key !== key).map((s, i) => ({ ...s, index: i })));
  }

  function move(key: string, dir: -1 | 1) {
    setScenes((prev) => {
      const i = prev.findIndex((s) => s.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((s, idx) => ({ ...s, index: idx }));
    });
  }

  async function onAssemble() {
    if (!projectId) return;
    if (!live) {
      setAssembled(true);
      return;
    }
    setBusy(true);
    try {
      await assembleStoryboard(projectId, totalSeconds);
      setAssembled(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {intro}
      {/* Brief / plan */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <Label>Brief</Label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={2}
          className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm outline-none focus:border-white/30"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-xs text-white/40">Scenes</span>
          <div className="flex gap-1.5">
            {SCENE_COUNTS.map((c) => (
              <Chip key={c} active={count === c} onClick={() => setCount(c)}>{c}</Chip>
            ))}
          </div>
          <button
            onClick={() => loadDrafts(draftScenesFromBrief(brief, count))}
            disabled={busy}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
          >
            {persisted ? "Re-draft scenes" : "Draft storyboard"}
          </button>
          <button onClick={onAddScene} disabled={busy} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
            Add scene
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-amber-300">{error}</p>}
      </div>

      {scenes.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-white/10 text-center text-white/40">
          <div>
            <p className="text-sm">Draft a storyboard, then edit each scene.</p>
            <p className="mt-1 text-xs">Write the script per scene and choose Text→Video or Image→Video.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-white/55">
              {scenes.length} scenes · {fmtDuration(totalSeconds)} ·{" "}
              <span className="text-white/40">{scenes.filter((s) => s.status === "READY").length} ready</span>
              {!live ? (
                <span className="ml-1 text-amber-300/70">· preview — sign in to save</span>
              ) : (
                !persisted && <span className="ml-1 text-white/30">· not saved yet — generating saves it</span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onGenerateAll} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
                Generate all
              </button>
              <button
                onClick={onAssemble}
                disabled={!allReady || busy || assembled}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
              >
                {assembled ? "Assembled ✓" : "Assemble film"}
              </button>
            </div>
          </div>

          {assembled && (
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.04] p-5">
              <h3 className="font-semibold text-emerald-200">Final cut assembled</h3>
              <p className="text-sm text-white/60">{fmtDuration(totalSeconds)} from {scenes.length} scenes · saved to your studio.</p>
            </div>
          )}

          <div className="space-y-3">
            {scenes.map((s, i) => (
              <SceneCard
                key={s.key}
                scene={s}
                isFirst={i === 0}
                isLast={i === scenes.length - 1}
                onPatch={(p) => patch(s.key, p)}
                onSave={() => onSaveScene(s.key)}
                onUpload={(f) => onUpload(s.key, f)}
                onGenerateImage={() => onGenerateImage(s.key)}
                onGenerate={() => onGenerate(s.key)}
                onRemove={() => onRemove(s.key)}
                onMove={(d) => move(s.key, d)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SceneCard({
  scene: s,
  isFirst,
  isLast,
  onPatch,
  onSave,
  onUpload,
  onGenerateImage,
  onGenerate,
  onRemove,
  onMove,
}: {
  scene: SceneDraft;
  isFirst: boolean;
  isLast: boolean;
  onPatch: (p: Partial<SceneDraft>) => void;
  onSave: () => void;
  onUpload: (f: File) => void;
  onGenerateImage: () => void;
  onGenerate: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [details, setDetails] = useState(false);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-medium">Scene {s.index + 1}</span>
          <StatusBadge status={s.status} />
        </div>
        <div className="flex items-center gap-1 text-white/40">
          <IconBtn disabled={isFirst} onClick={() => onMove(-1)} title="Move up">↑</IconBtn>
          <IconBtn disabled={isLast} onClick={() => onMove(1)} title="Move down">↓</IconBtn>
          <IconBtn onClick={onRemove} title="Remove">✕</IconBtn>
        </div>
      </div>

      <input
        value={s.heading}
        onChange={(e) => onPatch({ heading: e.target.value })}
        onBlur={onSave}
        placeholder="Scene title"
        className="mt-3 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-medium outline-none focus:border-white/30"
      />
      <textarea
        value={s.script}
        onChange={(e) => onPatch({ script: e.target.value })}
        onBlur={onSave}
        rows={2}
        placeholder="What happens in this scene? (action / description)"
        className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-white/30"
      />

      <button onClick={() => setDetails((v) => !v)} className="mt-2 text-xs text-white/45 transition hover:text-white">
        {details ? "▾ Hide scene details" : "▸ Scene details — dialogue, narration, camera, location, mood, music"}
      </button>
      {details && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <DetailField label="Dialogue" value={s.dialogue} onChange={(v) => onPatch({ dialogue: v })} onSave={onSave} placeholder="Spoken lines" />
          <DetailField label="Narration" value={s.narration} onChange={(v) => onPatch({ narration: v })} onSave={onSave} placeholder="Voiceover" />
          <DetailField label="Camera" value={s.camera} onChange={(v) => onPatch({ camera: v })} onSave={onSave} placeholder="e.g. slow dolly in, low angle" />
          <DetailField label="Location" value={s.location} onChange={(v) => onPatch({ location: v })} onSave={onSave} placeholder="Where it takes place" />
          <DetailField label="Mood" value={s.mood} onChange={(v) => onPatch({ mood: v })} onSave={onSave} placeholder="e.g. tense, melancholic" />
          <DetailField label="Music" value={s.music} onChange={(v) => onPatch({ music: v })} onSave={onSave} placeholder="e.g. somber strings" />
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <Label>Source</Label>
          <div className="mt-1.5 flex gap-2">
            {(["text", "image"] as ShotSource[]).map((src) => (
              <Chip key={src} active={s.source === src} onClick={() => { onPatch({ source: src }); }}>
                {src === "text" ? "Text → Video" : "Image → Video"}
              </Chip>
            ))}
          </div>

          {s.source === "image" && (
            <div className="mt-3 flex items-center gap-3">
              <SeedPreview scene={s} />
              <div className="flex flex-col gap-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                />
                <button onClick={() => fileRef.current?.click()} className="rounded-md border border-white/15 px-2.5 py-1 text-xs hover:bg-white/5">
                  Upload image
                </button>
                <button onClick={onGenerateImage} className="rounded-md border border-white/15 px-2.5 py-1 text-xs hover:bg-white/5">
                  AI-generate seed
                </button>
                <ReferencePicker onPick={(label) => { onPatch({ seedKey: `ref:${label}`, seedUrl: null, source: "image" }); onSave(); }} />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end justify-between gap-2">
          <div className="flex gap-1.5">
            {CLIP_DURATIONS.map((d) => (
              <Chip key={d} active={s.durationSec === d} onClick={() => { onPatch({ durationSec: d }); onSave(); }}>{d}s</Chip>
            ))}
          </div>
          <button
            onClick={onGenerate}
            disabled={s.status === "GENERATING"}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {s.status === "GENERATING" ? "Generating…" : s.status === "READY" ? "Regenerate" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SeedPreview({ scene: s }: { scene: SceneDraft }) {
  if (s.seedUrl) {
    return <img src={s.seedUrl} alt="seed" className="h-16 w-28 rounded-lg object-cover" />;
  }
  if (s.seedKey) {
    const label = s.seedKey.startsWith("generated:") ? "AI seed" : s.seedKey.startsWith("ref:") ? s.seedKey.slice(4) : "seed";
    return (
      <div className="flex h-16 w-28 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/40 to-fuchsia-500/30 text-[10px] text-white/80">
        {label}
      </div>
    );
  }
  return <div className="flex h-16 w-28 items-center justify-center rounded-lg border border-dashed border-white/15 text-[10px] text-white/40">no seed</div>;
}

function ReferencePicker({ onPick }: { onPick: (label: string) => void }) {
  // Real character/world anchors from the user's Library (RLS-scoped).
  const [open, setOpen] = useState(false);
  const [anchors, setAnchors] = useState<{ characters: { id: string; name: string }[]; worlds: { id: string; name: string }[] } | null>(null);

  useEffect(() => {
    if (open && !anchors) listAnchors().then(setAnchors).catch(() => setAnchors({ characters: [], worlds: [] }));
  }, [open, anchors]);

  const empty = anchors && anchors.characters.length === 0 && anchors.worlds.length === 0;

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="rounded-md border border-white/15 px-2.5 py-1 text-xs hover:bg-white/5">
        Reference…
      </button>
      {open && (
        <div className="absolute z-10 mt-1 max-h-64 w-48 overflow-y-auto rounded-lg border border-white/15 bg-[#0a0a0f] p-2 text-xs shadow-xl">
          {!anchors ? (
            <p className="px-1 py-1 text-white/40">Loading…</p>
          ) : empty ? (
            <p className="px-1 py-1 text-white/40">
              No saved assets yet. Create characters and worlds in your Library to anchor scenes.
            </p>
          ) : (
            <>
              {anchors.characters.length > 0 && <p className="px-1 pb-1 pt-0.5 text-white/40">Characters</p>}
              {anchors.characters.map((c) => (
                <AnchorBtn key={c.id} name={c.name} onClick={() => { onPick(c.name); setOpen(false); }} />
              ))}
              {anchors.worlds.length > 0 && <p className="px-1 pb-1 pt-1.5 text-white/40">Worlds</p>}
              {anchors.worlds.map((w) => (
                <AnchorBtn key={w.id} name={w.name} onClick={() => { onPick(w.name); setOpen(false); }} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AnchorBtn({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="block w-full truncate rounded px-2 py-1 text-left text-white/70 hover:bg-white/10">
      {name}
    </button>
  );
}

/* ── small UI bits ──────────────────────────────────────────── */
function DetailField({
  label,
  value,
  onChange,
  onSave,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-white/40">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onSave}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-sm outline-none focus:border-white/30"
      />
    </label>
  );
}
function Label({ children }: { children: ReactNode }) {
  return <span className="text-xs uppercase tracking-wider text-white/40">{children}</span>;
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active ? "border-white/40 bg-white/10 text-white" : "border-white/10 text-white/60 hover:border-white/25"
      }`}
    >
      {children}
    </button>
  );
}
function IconBtn({ children, onClick, disabled, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-6 w-6 items-center justify-center rounded-md text-sm transition hover:bg-white/10 disabled:opacity-25"
    >
      {children}
    </button>
  );
}
function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "READY"
      ? "border-emerald-400/40 text-emerald-300"
      : status === "GENERATING"
        ? "border-sky-400/40 text-sky-300"
        : status === "FAILED"
          ? "border-rose-400/40 text-rose-300"
          : "border-white/20 text-white/50";
  const label = status === "PENDING" ? "Draft" : status[0] + status.slice(1).toLowerCase();
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>{label}</span>;
}
