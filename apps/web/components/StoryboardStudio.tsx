"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmtDuration } from "../lib/system";
import {
  draftScenesFromBrief,
  newDraft,
  createStoryboardProject,
  persistScene,
  uploadSeedImage,
  uploadAsset,
  subscribeScenes,
  generateScene,
  assembleStoryboard,
  CAMERA_TYPES,
  CAMERA_MOVEMENTS,
  MUSIC_STYLES,
  CLIP_DURATIONS,
  computeContinuity,
  toSceneInput,
  applyAutoContinuity,
  type SceneDraft,
  type SceneContinuity,
  type ProjectState,
} from "../lib/storyboard";
import type { ShotSource } from "../lib/database.types";
import { listAnchors } from "../lib/library";
import { subscribeProject, type ProjectRow } from "../lib/projects";
import { useAuth } from "./AuthProvider";
import { Status } from "./cf/primitives";

const SCENE_COUNTS = [3, 4, 5, 6, 8];
type Anchors = { characters: { id: string; name: string }[]; worlds: { id: string; name: string }[] };

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
  /** Video→Video flows: a source clip that conditions EVERY scaffolded scene.
   *  Uploaded once when the project is created; scenes get its storage key. */
  sourceVideo?: File | null;
}

export function StoryboardStudio({ initialBrief, initialScenes, defaultSource = "text", intro, sourceVideo }: StoryboardStudioProps = {}) {
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
  const projectChannelRef = useRef<{ unsubscribe: () => void } | null>(null);
  // The live project row: assembly status, the worker's refusals (credits, plan length) and failures.
  const [projectRow, setProjectRow] = useState<ProjectRow | null>(null);

  // Live = persist to Supabase + Realtime. Otherwise everything runs locally as
  // a preview (no account needed) so the full flow is usable on the deploy.
  const { enabled, user } = useAuth();
  const live = enabled && !!user;
  const [anchors, setAnchors] = useState<Anchors>({ characters: [], worlds: [] });

  const totalSeconds = useMemo(() => scenes.reduce((s, d) => s + d.durationSec, 0), [scenes]);
  const allReady = scenes.length > 0 && scenes.every((s) => s.status === "READY");
  const persisted = Boolean(projectId);

  // The Continuity Engine: fold every scene into per-scene inherited state +
  // score + dependencies, and the running project timeline.
  const continuity = useMemo(() => computeContinuity(scenes.map(toSceneInput)), [scenes]);
  const contByIndex = useMemo(() => new Map(continuity.perScene.map((c) => [c.index, c])), [continuity]);

  useEffect(() => {
    // Library characters/worlds available as scene anchors.
    listAnchors().then(setAnchors).catch(() => {});
    return () => {
      cancelers.current.forEach((c) => c.cancel());
      channelRef.current?.unsubscribe();
      projectChannelRef.current?.unsubscribe();
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
    projectChannelRef.current?.unsubscribe();
    projectChannelRef.current = subscribeProject(id, (row) => {
      setProjectRow(row);
      if (row.error_message) setError(row.error_message);
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
      // Video→Video: ship the source clip to storage ONCE and condition every
      // scene that doesn't already carry its own reference video.
      let sourceKey: string | null = null;
      if (sourceVideo) {
        const up = await uploadAsset(id, "source", sourceVideo, "refvideo");
        sourceKey = up.key;
      }
      const out: SceneDraft[] = [];
      for (const d of list) {
        const draft = sourceKey && !d.refVideoKey ? { ...d, refVideoKey: sourceKey, refVideoName: sourceVideo?.name ?? "source clip" } : d;
        const { sceneId, shotId } = await persistScene(id, draft);
        out.push({ ...draft, sceneId, shotId });
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
      const c = contByIndex.get(d.index);
      const { sceneId, shotId } = await persistScene(projectId, d, { continuityScore: c?.score, dependsOn: c?.dependsOn });
      patch(key, { sceneId, shotId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  function onAddScene() {
    setScenes((prev) => [...prev, { ...newDraft(prev.length), source: defaultSource }]);
  }

  /** Director auto-fill: propose a Scene Bridge + state for every scene from the
   *  script (blanks only), then persist the folded score/deps for saved scenes. */
  async function onAutoContinuity() {
    const filled = applyAutoContinuity(scenes);
    setScenes(filled);
    if (!live || !projectId) return;
    const folded = computeContinuity(filled.map(toSceneInput));
    const cByIdx = new Map(folded.perScene.map((c) => [c.index, c]));
    for (const d of filled) {
      if (!d.sceneId) continue; // new scenes persist on their first save/generate
      const c = cByIdx.get(d.index);
      try {
        await persistScene(projectId, d, { continuityScore: c?.score, dependsOn: c?.dependsOn });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Auto-fill save failed");
      }
    }
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
    // Marks the scene image→video with no uploaded still: persistScene stores no
    // seed key, and the render worker's resolveSeedKey paints one from the
    // prompt (GPT-image-1) when the shot generates — or falls back to
    // text→video when no image provider is configured.
    patch(key, { source: "image", seedKey: `generated:${key}`, seedUrl: null });
    onSaveScene(key);
  }

  async function onUploadVideo(key: string, file: File) {
    if (!live) {
      patch(key, { refVideoKey: `local:${key}`, refVideoName: file.name });
      return;
    }
    try {
      const { id } = await ensureStarted();
      const { key: refKey } = await uploadAsset(id, key, file, "refvideo");
      patch(key, { refVideoKey: refKey, refVideoName: file.name });
      await onSaveScene(key);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Video upload failed");
    }
  }

  function startGen(d: SceneDraft, id: string) {
    if (!d.sceneId || !d.shotId) return;
    cancelers.current.get(d.key)?.cancel();
    patch(d.key, { status: "GENERATING" });
    if (live) {
      // Save the scene's latest direction, then queue its shot. The worker
      // claims it, generates, and writes status back → Realtime → the board.
      const c = contByIndex.get(d.index);
      void persistScene(id, d, { continuityScore: c?.score, dependsOn: c?.dependsOn })
        .then(() => generateScene(d.sceneId!, d.shotId!))
        .catch((e) => {
          patch(d.key, { status: "FAILED" });
          setError(e instanceof Error ? e.message : "Could not queue the scene");
        });
    } else {
      // Preview: simulate the render locally.
      const t = setTimeout(() => patch(d.key, { status: "READY" }), 1400 + Math.random() * 1200);
      cancelers.current.set(d.key, { cancel: () => clearTimeout(t) });
    }
  }

  async function onGenerate(key: string) {
    try {
      const { id, scenes: list } = await ensureStarted();
      const d = list.find((s) => s.key === key);
      if (d) startGen(d, id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    }
  }

  async function onGenerateAll() {
    try {
      const { id, scenes: list } = await ensureStarted();
      list.forEach((s) => s.status !== "READY" && startGen(s, id));
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
    setError(null);
    try {
      await assembleStoryboard(projectId);
      setAssembled(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not request assembly");
    } finally {
      setBusy(false);
    }
  }

  const ready = scenes.filter((x) => x.status === "READY").length;
  // The worker either rejected the request (back to GENERATING with a reason) or the render failed.
  const assemblyFailed = live && assembled && !!projectRow && (projectRow.status === "FAILED" || (projectRow.status === "GENERATING" && !!projectRow.error_message));
  return (
    <div className="space-y-8">
      {intro}
      {/* The Director's Board is a dark room inside the paper studio. */}
      <section className="cf-dark" aria-label="Director's board">
        <div className="grid gap-px bg-cf-line lg:grid-cols-[1.35fr_0.65fr]">
          <div className="bg-cf-bg p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <span className="cf-label">Director&apos;s board</span>
              <span className={`cf-label ${live ? "text-cf-accent" : "text-cf-warn"}`}>
                {live ? (persisted ? "Live · saved" : "Live · saves on first generate") : "Preview · sign in to save"}
              </span>
            </div>
            <label htmlFor="board-brief" className="mb-2.5 mt-8 block font-mono text-[9px] uppercase tracking-[0.1em]">
              The brief
            </label>
            <textarea id="board-brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={3} className="cf-input resize-y p-5 leading-[1.7]" />
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className="cf-label mr-2">Scenes</span>
              {SCENE_COUNTS.map((c) => (
                <Chip key={c} active={count === c} onClick={() => setCount(c)}>{c}</Chip>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap gap-2">
              <button type="button" onClick={() => loadDrafts(draftScenesFromBrief(brief, count))} disabled={busy} className="cf-btn-ink">
                {persisted ? "Re-draft scenes" : "Draft storyboard"}
              </button>
              <button type="button" onClick={onAddScene} disabled={busy} className="cf-btn-line">
                Add scene
              </button>
              {scenes.length > 0 && (
                <button
                  type="button"
                  onClick={onAutoContinuity}
                  disabled={busy}
                  title="The Director proposes a Scene Bridge + state (emotion, injuries, season, destroyed locations, goals) for every scene from the script. Fills blanks only."
                  className="cf-btn-line"
                >
                  Auto-fill continuity
                </button>
              )}
            </div>
            {error && (
              <p role="alert" className="mt-5 border-l-2 border-cf-danger pl-3 text-[12px] text-cf-danger">
                {error}
              </p>
            )}
          </div>
          <div className="bg-cf-bg p-6 sm:p-8">
            <div className="cf-label">The cut</div>
            <dl className="mt-8 border-t border-cf-line">
              {[
                ["Scenes", String(scenes.length)],
                ["Runtime", fmtDuration(totalSeconds)],
                ["Ready", `${ready} / ${scenes.length}`],
                ["Continuity", scenes.length ? `${Math.round(continuity.perScene.reduce((t, c) => t + c.score, 0) / Math.max(1, continuity.perScene.length))}%` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-cf-line py-4 text-[11px]">
                  <dt className="text-cf-muted">{k}</dt>
                  <dd className="font-mono text-[10px] uppercase">{v}</dd>
                </div>
              ))}
            </dl>
            {scenes.length > 0 && (
              <div className="mt-7 flex flex-wrap gap-2">
                <button type="button" onClick={onGenerateAll} className="cf-btn-line">
                  Generate all
                </button>
                <button type="button" onClick={onAssemble} disabled={!allReady || busy || (assembled && !assemblyFailed)} className="cf-btn-accent">
                  {assembled && !assemblyFailed ? (live && projectRow?.status !== "READY" ? "Assembling…" : "Assembled") : "Assemble film"}
                </button>
              </div>
            )}
            {scenes.length > 0 && !allReady && <p className="cf-label mt-3 leading-relaxed">Assembly opens once every scene is ready.</p>}
          </div>
        </div>

        {assembled && (
          <div className="border-t border-cf-line bg-cf-panel px-6 py-6 sm:px-8" aria-live="polite">
            {!live ? (
              <>
                <span className="cf-label text-cf-warn">Preview assembly</span>
                <p className="cf-display mt-2 text-[28px] leading-none">
                  {fmtDuration(totalSeconds)} from {scenes.length} scenes
                </p>
                <p className="cf-label mt-2">Preview — nothing was rendered. Sign in to assemble for real.</p>
              </>
            ) : projectRow?.status === "READY" ? (
              <>
                <span className="cf-label text-cf-ok">Final cut ready</span>
                <p className="cf-display mt-2 text-[28px] leading-none">
                  {fmtDuration(totalSeconds)} from {scenes.length} scenes
                </p>
                <Link href={`/projects/${projectId}`} className="cf-link mt-3 inline-block">
                  Open the production file →
                </Link>
              </>
            ) : assemblyFailed ? (
              <>
                <span className="cf-label text-cf-danger">Assembly stopped</span>
                <p className="mt-2 text-[13px] text-cf-danger">{projectRow?.error_message ?? "The render worker could not assemble the cut."}</p>
              </>
            ) : (
              <>
                <span className="cf-label text-cf-accent">Assembling on the render worker</span>
                <p className="cf-display mt-2 text-[28px] leading-none">Stitching {scenes.length} scenes into the final cut.</p>
                <p className="cf-label mt-2">Picture, narration and music are being mixed. This board updates when the film is ready.</p>
              </>
            )}
          </div>
        )}

        {scenes.length === 0 ? (
          <div className="flex min-h-[300px] items-center justify-center border-t border-cf-line px-6 text-center">
            <div>
              <p className="cf-display text-[clamp(32px,4vw,52px)] leading-none">Draft the board.</p>
              <p className="cf-label mt-3">Write each scene, choose text or image as its source, then generate it alone.</p>
            </div>
          </div>
        ) : (
          <ol className="border-t border-cf-line">
            {scenes.map((sc, i) => (
              <li key={sc.key} className="border-b border-cf-line">
                <SceneCard
                  scene={sc}
                  live={live}
                  anchors={anchors}
                  cont={contByIndex.get(sc.index)}
                  timeline={continuity.final.timeline}
                  isFirst={i === 0}
                  isLast={i === scenes.length - 1}
                  onPatch={(p) => patch(sc.key, p)}
                  onSave={() => onSaveScene(sc.key)}
                  onUpload={(f) => onUpload(sc.key, f)}
                  onUploadVideo={(f) => onUploadVideo(sc.key, f)}
                  onGenerateImage={() => onGenerateImage(sc.key)}
                  onGenerate={() => onGenerate(sc.key)}
                  onRemove={() => onRemove(sc.key)}
                  onMove={(d) => move(sc.key, d)}
                />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** A scene as a complete production object — prompt, character/world, sources,
 *  camera plan, dialogue/narration, music and duration. */
function SceneCard({
  scene: s,
  live,
  anchors,
  cont,
  timeline,
  isFirst,
  isLast,
  onPatch,
  onSave,
  onUpload,
  onUploadVideo,
  onGenerateImage,
  onGenerate,
  onRemove,
  onMove,
}: {
  scene: SceneDraft;
  live: boolean;
  anchors: Anchors;
  cont?: SceneContinuity;
  timeline: ProjectState["timeline"];
  isFirst: boolean;
  isLast: boolean;
  onPatch: (p: Partial<SceneDraft>) => void;
  onSave: () => void;
  onUpload: (f: File) => void;
  onUploadVideo: (f: File) => void;
  onGenerateImage: () => void;
  onGenerate: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const [details, setDetails] = useState(false);
  const [continuity, setContinuity] = useState(false);
  const save = () => onSave();
  const patchBridge = (p: Partial<SceneDraft["bridge"]>) => onPatch({ bridge: { ...s.bridge, ...p } });
  const n = String(s.index + 1).padStart(2, "0");
  return (
    <article className="grid gap-px bg-cf-line xl:grid-cols-[260px_1fr]" aria-label={`Scene ${s.index + 1}`}>
      {/* Frame column */}
      <div className="bg-cf-bg p-5 sm:p-6">
        <div className="flex items-start justify-between">
          <span className="cf-display text-[44px] leading-none">{n}</span>
          <StatusBadge status={s.status} />
        </div>
        <div className="mt-5">
          <SeedPreview scene={s} />
        </div>
        <div className="mt-4 flex gap-1">
          <IconBtn disabled={isFirst} onClick={() => onMove(-1)} title="Move scene earlier">↑</IconBtn>
          <IconBtn disabled={isLast} onClick={() => onMove(1)} title="Move scene later">↓</IconBtn>
          <IconBtn onClick={onRemove} title="Remove scene">✕</IconBtn>
        </div>
      </div>

      {/* Direction column */}
      <div className="min-w-0 bg-cf-bg p-5 sm:p-6">
        <input
          value={s.heading}
          onChange={(e) => onPatch({ heading: e.target.value })}
          onBlur={save}
          placeholder="Scene title"
          aria-label={`Scene ${s.index + 1} title`}
          className="w-full border-0 border-b border-cf-line bg-transparent pb-2 font-serif text-[26px] tracking-[-0.03em] text-cf-fg outline-none placeholder:text-cf-dim focus:border-cf-fg"
        />
        <label className="mt-5 block">
          <Label>Scene prompt</Label>
          <textarea
            value={s.script}
            onChange={(e) => onPatch({ script: e.target.value })}
            onBlur={save}
            rows={2}
            placeholder="Describe the scene — what happens, who's there, the mood…"
            className="cf-input mt-2 resize-y"
          />
        </label>

        {/* Bible references */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Character"
            value={s.character}
            options={anchors.characters.map((c) => c.name)}
            empty="No saved characters — cast one in Characters"
            onChange={(v) => {
              // Anchor visual continuity to the library asset id, not just the name.
              const id = anchors.characters.find((c) => c.name === v)?.id ?? "";
              onPatch({ character: v, characterId: id });
              save();
            }}
          />
          <SelectField
            label="World"
            value={s.world}
            options={anchors.worlds.map((w) => w.name)}
            empty="No saved worlds — design one in Worlds"
            onChange={(v) => { onPatch({ world: v }); save(); }}
          />
        </div>

        {/* Source + reference video */}
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <Label>Source</Label>
            <div className="mt-2 flex gap-1.5">
              {(["text", "image"] as ShotSource[]).map((src) => (
                <Chip key={src} active={s.source === src} onClick={() => { onPatch({ source: src }); save(); }}>
                  {src === "text" ? "Text → Video" : "Image → Video"}
                </Chip>
              ))}
            </div>
            {s.source === "image" && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
                <button type="button" onClick={() => imgRef.current?.click()} className="cf-option">Upload seed frame</button>
                <button
                  type="button"
                  onClick={onGenerateImage}
                  title={
                    live
                      ? "The render worker paints this scene's seed frame from its prompt (GPT-image-1) when the shot generates; without an image provider it falls back to text-to-video."
                      : "Preview: the seed frame is painted only when a signed-in run reaches the render worker."
                  }
                  className="cf-option"
                >
                  AI seed frame
                </button>
              </div>
            )}
          </div>
          <div>
            <Label>Reference video · motion style</Label>
            <div className="mt-2 flex items-center gap-3">
              <input ref={vidRef} type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUploadVideo(e.target.files[0])} />
              <button type="button" onClick={() => vidRef.current?.click()} className="cf-option">Upload video</button>
              {s.refVideoName && <span className="truncate text-[11px] text-cf-muted">{s.refVideoName}</span>}
            </div>
          </div>
        </div>

        {/* Camera plan + music */}
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <SelectField label="Camera" value={s.cameraType} options={[...CAMERA_TYPES]} onChange={(v) => { onPatch({ cameraType: v }); save(); }} />
          <SelectField label="Movement" value={s.movement} options={[...CAMERA_MOVEMENTS]} onChange={(v) => { onPatch({ movement: v }); save(); }} />
          <SelectField label="Music" value={s.musicStyle} options={[...MUSIC_STYLES]} onChange={(v) => { onPatch({ musicStyle: v }); save(); }} />
        </div>

        {/* Dialogue / narration / scene details */}
        <button type="button" onClick={() => setDetails((v) => !v)} aria-expanded={details} className="cf-link mt-6 block text-cf-muted hover:text-cf-fg">
          {details ? "− Dialogue, narration, location & mood" : "+ Dialogue, narration, location & mood"}
        </button>
        {details && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <DetailField label="Dialogue" value={s.dialogue} onChange={(v) => onPatch({ dialogue: v })} onSave={save} placeholder="King: “We ride at dawn.”" />
            <DetailField label="Narration" value={s.narration} onChange={(v) => onPatch({ narration: v })} onSave={save} placeholder="Voiceover" />
            <DetailField label="Location" value={s.location} onChange={(v) => onPatch({ location: v })} onSave={save} placeholder="Where it takes place" />
            <DetailField label="Mood" value={s.mood} onChange={(v) => onPatch({ mood: v })} onSave={save} placeholder="e.g. tense, melancholic" />
          </div>
        )}

        {/* Continuity — inherited state, score, dependencies, timeline + the bridge */}
        {cont && (
          <div className="mt-5 border-t border-cf-line pt-4">
            <button type="button" onClick={() => setContinuity((v) => !v)} aria-expanded={continuity} className="flex w-full items-center justify-between gap-3 text-left">
              <span className="flex flex-wrap items-center gap-3">
                <Label>Continuity</Label>
                <ScoreBadge score={cont.score} />
                {cont.dependsOn.length > 0 && <span className="cf-label">depends on {cont.dependsOn.map((d) => `S${d + 1}`).join(", ")}</span>}
                {cont.affects.length > 0 && <span className="cf-label text-cf-dim">affects {cont.affects.map((d) => `S${d + 1}`).join(", ")}</span>}
              </span>
              <span className="cf-label">{continuity ? "−" : "+"}</span>
            </button>

            {continuity && (
              <div className="mt-4 space-y-5">
                <div className="flex flex-wrap gap-1.5">
                  {s.character && <Tag>{s.character}{s.characterId ? ` · ${s.characterId}` : ""}</Tag>}
                  {s.wardrobe && <Tag>Wardrobe · {s.wardrobe}</Tag>}
                  {s.world && <Tag>{s.world}</Tag>}
                  {s.location && <Tag>{s.location}</Tag>}
                </div>

                <div>
                  <Label>Inherited state</Label>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {inheritedChips(cont.inherited).map((c) => (
                      <span key={c} className="border border-cf-line px-2 py-1 text-[11px] text-cf-muted">{c}</span>
                    ))}
                    {inheritedChips(cont.inherited).length === 0 && <span className="text-[11px] text-cf-dim">Nothing inherited yet — this is the opening state.</span>}
                  </div>
                  {cont.bridgeIn?.whatCarriesForward.trim() && <p className="mt-2 text-[11px] text-cf-muted">Carried forward: {cont.bridgeIn.whatCarriesForward}</p>}
                  {cont.notes.length > 0 && (
                    <ul className="mt-2 list-disc pl-4 text-[11px] text-cf-warn">
                      {cont.notes.map((note) => <li key={note}>{note}</li>)}
                    </ul>
                  )}
                </div>

                <div>
                  <Label>Scene bridge → next scene</Label>
                  <div className="mt-2 grid gap-4 sm:grid-cols-2">
                    <DetailField label="What just happened" value={s.bridge.whatJustHappened} onChange={(v) => patchBridge({ whatJustHappened: v })} onSave={save} placeholder="Enemy invaded" />
                    <DetailField label="What changes" value={s.bridge.whatChanged} onChange={(v) => patchBridge({ whatChanged: v })} onSave={save} placeholder="King loses his army" />
                    <DetailField label="Carries forward" value={s.bridge.whatCarriesForward} onChange={(v) => patchBridge({ whatCarriesForward: v })} onSave={save} placeholder="Fear, a thirst for revenge" />
                    <DetailField label="Next scene requires" value={s.bridge.nextSceneRequirements} onChange={(v) => patchBridge({ nextSceneRequirements: v })} onSave={save} placeholder="Emergency council meeting" />
                  </div>
                </div>

                <div>
                  <Label>State this scene changes</Label>
                  <div className="mt-2 grid gap-4 sm:grid-cols-2">
                    <DetailField label="Health / injuries" value={s.health} onChange={(v) => onPatch({ health: v })} onSave={save} placeholder="bandaged arm" />
                    <DetailField label="Wardrobe / look" value={s.wardrobe} onChange={(v) => onPatch({ wardrobe: v })} onSave={save} placeholder="royal armor" />
                    <DetailField label="Season" value={s.season} onChange={(v) => onPatch({ season: v })} onSave={save} placeholder="winter" />
                    <DetailField label="Location status" value={s.locationStatus} onChange={(v) => onPatch({ locationStatus: v })} onSave={save} placeholder="destroyed" />
                    <DetailField label="Goal" value={s.goal} onChange={(v) => onPatch({ goal: v })} onSave={save} placeholder="find evidence" />
                  </div>
                </div>

                {timeline.length > 0 && (
                  <div>
                    <Label>Project timeline</Label>
                    <ol className="mt-2 border-t border-cf-line">
                      {timeline.map((t) => (
                        <li key={t.index} className={`grid grid-cols-[40px_1fr] border-b border-cf-line py-2 text-[11px] ${t.index === s.index ? "text-cf-fg" : "text-cf-muted"}`}>
                          <span className="font-mono text-[9px] text-cf-dim">S{t.index + 1}</span>
                          {t.event}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Duration + generate */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-cf-line pt-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Label>Clip</Label>
            <span className="w-2" />
            {CLIP_DURATIONS.map((d) => (
              <Chip key={d} active={s.durationSec === d} onClick={() => { onPatch({ durationSec: d }); save(); }}>{d}s</Chip>
            ))}
          </div>
          <button type="button" onClick={onGenerate} disabled={s.status === "GENERATING"} className="cf-btn-accent">
            {s.status === "GENERATING" ? (live ? "On the GPU…" : "Previewing…") : s.status === "READY" ? "Regenerate scene" : live ? "Generate scene" : "Preview scene"}
          </button>
        </div>
      </div>
    </article>
  );
}

function SelectField({
  label,
  value,
  options,
  empty,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  empty?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="cf-input mt-2 py-2.5">
        <option value="">{options.length === 0 && empty ? empty : `— ${label} —`}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function SeedPreview({ scene: s }: { scene: SceneDraft }) {
  const frame = "relative flex aspect-video w-full items-center justify-center overflow-hidden border border-cf-line";
  if (s.seedUrl) {
    /* Plain <img>: a signed or local object URL next/image cannot optimise. */
    return <img src={s.seedUrl} alt={`Seed frame for scene ${s.index + 1}`} className="aspect-video w-full object-cover" />;
  }
  if (s.seedKey) {
    const label = s.seedKey.startsWith("generated:") ? "AI seed · painted at render" : s.seedKey.startsWith("ref:") ? s.seedKey.slice(4) : "Seed frame";
    return (
      <div className={`${frame} bg-cf-panel`}>
        <span className="cf-label">{label}</span>
      </div>
    );
  }
  return (
    <div className={`${frame} border-dashed`}>
      <span className="cf-label text-cf-dim">{s.source === "image" ? "No seed frame" : "Text → video"}</span>
    </div>
  );
}

/* ── continuity UI bits ─────────────────────────────────────── */
function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 80 ? "text-cf-ok" : score >= 50 ? "text-cf-warn" : "text-cf-danger";
  return <span className={`font-mono text-[10px] ${tone}`}>{score}%</span>;
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="border border-cf-ok/40 px-2 py-1 text-[11px] text-cf-ok">{children}</span>;
}

/** Flatten the inherited Project Memory Graph into short display chips. */
function inheritedChips(s: ProjectState): string[] {
  const out: string[] = [];
  for (const [name, attrs] of Object.entries(s.characters)) {
    const v = Object.values(attrs).filter(Boolean).join(" · ");
    if (v) out.push(`${name}: ${v}`);
  }
  for (const [pair, rel] of Object.entries(s.relationships)) out.push(`${pair}: ${rel}`);
  for (const [loc, status] of Object.entries(s.locations)) out.push(`${loc} — ${status}`);
  for (const [k, v] of Object.entries(s.world)) out.push(`${k}: ${v}`);
  for (const [who, goal] of Object.entries(s.goals)) out.push(`${who} wants: ${goal}`);
  return out;
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
      <Label>{label}</Label>
      <input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onSave} placeholder={placeholder} className="cf-input mt-2 py-2.5" />
    </label>
  );
}
function Label({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-cf-muted">{children}</span>;
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="cf-option">
      {children}
    </button>
  );
}
function IconBtn({ children, onClick, disabled, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex h-8 w-8 items-center justify-center border border-cf-line text-[12px] text-cf-muted transition hover:border-cf-fg hover:text-cf-fg disabled:opacity-25"
    >
      {children}
    </button>
  );
}
function StatusBadge({ status }: { status: string }) {
  const tone = status === "READY" ? "ok" : status === "GENERATING" ? "live" : status === "FAILED" ? "danger" : "idle";
  const label = status === "PENDING" ? "Draft" : status[0] + status.slice(1).toLowerCase();
  return <Status tone={tone}>{label}</Status>;
}
