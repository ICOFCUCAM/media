"use client";

import { useRef, useState, type ReactNode } from "react";
import { StoryboardStudio } from "./StoryboardStudio";
import { newDraft, type SceneDraft } from "../lib/storyboard";
import type { ShotSource } from "../lib/database.types";

/* ─── Script → Film ───────────────────────────────────────────
 * Paste or upload a screenplay; we break it into scenes (on INT./EXT.
 * sluglines, else paragraphs) and drop straight into the scene workbench.
 */
export function ScriptStudio() {
  const [text, setText] = useState("");
  const [scenes, setScenes] = useState<SceneDraft[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (scenes) {
    return (
      <StoryboardStudio
        initialBrief={text.trim().split(/\n/)[0]?.slice(0, 80) || "Screenplay"}
        initialScenes={scenes}
        intro={<Banner>Parsed {scenes.length} scenes from your script. Edit any scene, then generate.</Banner>}
      />
    );
  }

  async function onFile(f: File) {
    setText(await f.text());
  }

  return (
    <div className="space-y-4">
      <Banner>Bring your own screenplay. We turn it into a shot list and scenes — you keep creative control.</Banner>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        placeholder={"INT. THRONE ROOM - NIGHT\n\nThe king studies a map by candlelight...\n\nEXT. CITY GATES - DAWN\n\nSoldiers gather in the mist."}
        className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.03] p-4 font-mono text-sm outline-none focus:border-white/30"
      />
      <div className="flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".txt,.md,.fountain,.fdx,text/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button onClick={() => fileRef.current?.click()} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
          Upload script
        </button>
        <button
          onClick={() => setScenes(parseScreenplay(text))}
          disabled={!text.trim()}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
        >
          Parse into scenes →
        </button>
      </div>
    </div>
  );
}

export function parseScreenplay(text: string): SceneDraft[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const slugRe = /^(INT\.|EXT\.|INT\/EXT\.|SCENE\s+\d+)/gim;
  const matches = [...trimmed.matchAll(slugRe)];
  let blocks: { heading: string; body: string }[] = [];
  if (matches.length >= 2) {
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index ?? 0;
      const end = i + 1 < matches.length ? matches[i + 1].index ?? trimmed.length : trimmed.length;
      const chunk = trimmed.slice(start, end).trim();
      const nl = chunk.indexOf("\n");
      const heading = (nl === -1 ? chunk : chunk.slice(0, nl)).trim().slice(0, 80);
      const body = (nl === -1 ? "" : chunk.slice(nl + 1)).trim();
      blocks.push({ heading, body });
    }
  } else {
    const paras = trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    blocks = paras.map((p, i) => ({ heading: `Scene ${i + 1}`, body: p }));
  }
  return blocks.slice(0, 24).map((b, i) => newDraft(i, b.heading, b.body || b.heading));
}

/* ─── Image → Video ───────────────────────────────────────────
 * Storyboard with image-to-video as the default source: each scene starts from
 * a seed frame you upload (or generate / reference) and gets motion.
 */
export function ImageStudio() {
  const first: SceneDraft[] = [{ ...newDraft(0, "Shot 1", ""), source: "image" as ShotSource }];
  return (
    <StoryboardStudio
      defaultSource="image"
      initialScenes={first}
      initialBrief="Image-driven sequence"
      intro={<Banner>Start from images. Upload a seed frame per scene (or generate / reference one), then add motion and camera.</Banner>}
    />
  );
}

/* ─── Audio → Film (beta) ─────────────────────────────────────
 * Upload narration and build a visual scene plan around it.
 */
export function AudioStudio() {
  const [name, setName] = useState<string | null>(null);
  const [count, setCount] = useState(4);
  const [scenes, setScenes] = useState<SceneDraft[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (scenes) {
    return (
      <StoryboardStudio
        initialBrief={`Narration: ${name ?? "voiceover"}`}
        initialScenes={scenes}
        intro={<Banner tone="beta">Scene plan built around your narration. Refine each beat and generate. (Audio sync lands when the TTS/align worker is wired.)</Banner>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Banner tone="beta">Audio → Film is in beta. Upload a voice recording, or generate narration with OpenAI TTS (voice “onyx”); we scaffold visuals beat-by-beat.</Banner>
      <div className="rounded-xl border border-dashed border-white/15 p-8 text-center">
        <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => setName(e.target.files?.[0]?.name ?? null)} />
        <p className="text-sm text-white/60">{name ? `Loaded: ${name}` : "Upload narration (MP3 / WAV / M4A)"}</p>
        <button onClick={() => fileRef.current?.click()} className="mt-3 rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
          {name ? "Choose another" : "Upload audio"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-white/40">Scenes</span>
        {[3, 4, 6, 8].map((c) => (
          <Pill key={c} active={count === c} onClick={() => setCount(c)}>{c}</Pill>
        ))}
        <button
          onClick={() => setScenes(Array.from({ length: count }, (_, i) => newDraft(i, `Beat ${i + 1}`, `Visualize beat ${i + 1} of the narration.`)))}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
        >
          Build scene plan →
        </button>
      </div>
    </div>
  );
}

/* ─── Video → Video (beta) ────────────────────────────────────
 * Upload a clip and choose an operation; scaffolds the work into scenes.
 */
const VIDEO_OPS = ["Variations", "Extend", "Remaster", "Style transfer", "Sequel"];
export function VideoStudio() {
  const [name, setName] = useState<string | null>(null);
  const [op, setOp] = useState(VIDEO_OPS[0]);
  const [scenes, setScenes] = useState<SceneDraft[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (scenes) {
    return (
      <StoryboardStudio
        initialBrief={`${op} of ${name ?? "source clip"}`}
        initialScenes={scenes}
        intro={<Banner tone="beta">{op} scaffolded into scenes. Tune each shot and generate. (Source-clip conditioning lands with the video-to-video adapter.)</Banner>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Banner tone="beta">Video → Video is in beta. Upload a clip and generate variations, extensions, remasters, style transfers or a sequel.</Banner>
      <div className="rounded-xl border border-dashed border-white/15 p-8 text-center">
        <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => setName(e.target.files?.[0]?.name ?? null)} />
        <p className="text-sm text-white/60">{name ? `Loaded: ${name}` : "Upload a source clip (MP4 / MOV)"}</p>
        <button onClick={() => fileRef.current?.click()} className="mt-3 rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
          {name ? "Choose another" : "Upload video"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-white/40">Operation</span>
        {VIDEO_OPS.map((o) => (
          <Pill key={o} active={op === o} onClick={() => setOp(o)}>{o}</Pill>
        ))}
        <button
          onClick={() => setScenes([newDraft(0, op, `${op} of the source clip.`), newDraft(1, "Continuation", "Carry the look and motion forward.")])}
          disabled={!name}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
        >
          Scaffold scenes →
        </button>
      </div>
    </div>
  );
}

/* ── shared bits ─────────────────────────────────────────────── */
function Banner({ children, tone }: { children: ReactNode; tone?: "beta" }) {
  return (
    <div
      className={`rounded-xl border p-4 text-sm ${
        tone === "beta" ? "border-amber-400/30 bg-amber-400/[0.04] text-amber-100/80" : "border-white/10 bg-white/[0.02] text-white/70"
      }`}
    >
      {tone === "beta" && <span className="mr-2 rounded-full border border-amber-400/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-300">Beta</span>}
      {children}
    </div>
  );
}
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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
