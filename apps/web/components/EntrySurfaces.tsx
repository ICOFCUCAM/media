"use client";

import { useRef, useState, type ReactNode } from "react";
import { StoryboardStudio } from "./StoryboardStudio";
import { newDraft, draftScenesFromBrief, type SceneDraft } from "../lib/storyboard";
import type { ShotSource } from "../lib/database.types";
import { Cell, Control, Split } from "./cf/primitives";

/* ─── Hybrid → auto-plan, then refine in the storyboard ───────
 * Auto generates a screenplay/scene plan, then opens the Storyboard editor so
 * the creator refines each scene before rendering.
 */
export function HybridStudio() {
  const [brief, setBrief] = useState(
    "A historical epic about an African kingdom fighting for its independence.",
  );
  const [count, setCount] = useState(5);
  const [scenes, setScenes] = useState<SceneDraft[] | null>(null);

  if (scenes) {
    return (
      <StoryboardStudio
        initialBrief={brief}
        initialScenes={scenes}
        intro={<Banner>Auto-generated plan loaded. Refine any scene — character, image, camera, dialogue — then generate.</Banner>}
      />
    );
  }

  return (
    <Intake
      label="Hybrid direction"
      title="Draft it, then direct it."
      copy="We draft the screenplay, world, characters and scenes, then open the Director's Board so you refine every scene before rendering."
      next={["Scene plan drafted from your brief", "Opens in the Director's Board", "Refine cast, frames, camera and dialogue", "Generate scene by scene"]}
    >
      <label htmlFor="hybrid-brief" className="cf-label mb-2.5 block text-cf-fg">The brief</label>
      <textarea id="hybrid-brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={5} className="cf-input resize-y p-5 leading-[1.7]" />
      <Control name="Scenes" value={`${count} scenes`}>
        <div className="flex flex-wrap gap-1.5">
          {[4, 5, 6, 8].map((c) => (
            <Pill key={c} active={count === c} onClick={() => setCount(c)}>{c}</Pill>
          ))}
        </div>
      </Control>
      <button type="button" onClick={() => setScenes(draftScenesFromBrief(brief, count))} disabled={!brief.trim()} className="cf-btn-ink mt-9">
        Draft plan &amp; open the board →
      </button>
    </Intake>
  );
}

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
    <Intake
      label="Screenplay"
      title="Bring the script."
      copy="Paste or upload a screenplay. We break it into scenes on its sluglines (or paragraphs) — you keep creative control of every one."
      next={["Split on INT. / EXT. sluglines", "Up to 24 scenes", "Opens in the Director's Board", "Generate scene by scene"]}
    >
      <label htmlFor="script-text" className="cf-label mb-2.5 block text-cf-fg">Screenplay</label>
      <textarea
        id="script-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        placeholder={"INT. THRONE ROOM - NIGHT\n\nThe king studies a map by candlelight...\n\nEXT. CITY GATES - DAWN\n\nSoldiers gather in the mist."}
        className="cf-input resize-y p-5 font-mono text-[13px] leading-[1.7]"
      />
      <div className="mt-6 flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".txt,.md,.fountain,.fdx,text/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} className="cf-btn-line">
          Upload script
        </button>
        <button type="button" onClick={() => setScenes(parseScreenplay(text))} disabled={!text.trim()} className="cf-btn-ink">
          Break into scenes →
        </button>
      </div>
    </Intake>
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
    <Intake
      beta
      label="Narration"
      title="Start from the voice."
      copy="Upload a voice recording; we scaffold the visuals beat by beat around it. Audio-to-picture sync arrives with the alignment worker — today the plan is built from your beat count."
      next={["One scene per narration beat", "Opens in the Director's Board", "Describe each beat's picture", "Generate scene by scene"]}
    >
      <Drop accept="audio/*" inputRef={fileRef} onPick={(f) => setName(f?.name ?? null)} name={name} empty="Upload narration — MP3 / WAV / M4A" />
      <Control name="Beats" value={`${count} scenes`}>
        <div className="flex flex-wrap gap-1.5">
          {[3, 4, 6, 8].map((c) => (
            <Pill key={c} active={count === c} onClick={() => setCount(c)}>{c}</Pill>
          ))}
        </div>
      </Control>
      <button
        type="button"
        onClick={() => setScenes(Array.from({ length: count }, (_, i) => newDraft(i, `Beat ${i + 1}`, `Visualize beat ${i + 1} of the narration.`)))}
        className="cf-btn-ink mt-9"
      >
        Build the scene plan →
      </button>
    </Intake>
  );
}

/* ─── Video → Video (beta) ────────────────────────────────────
 * Upload a clip and choose an operation; scaffolds the work into scenes.
 */
const VIDEO_OPS = ["Variations", "Extend", "Remaster", "Style transfer", "Sequel"];
export function VideoStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [op, setOp] = useState(VIDEO_OPS[0]);
  const [scenes, setScenes] = useState<SceneDraft[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const name = file?.name ?? null;

  if (scenes) {
    return (
      <StoryboardStudio
        initialBrief={`${op} of ${name ?? "source clip"}`}
        initialScenes={scenes}
        sourceVideo={file}
        intro={
          <Banner tone="beta">
            {op} scaffolded into scenes — your clip conditions every shot (video-to-video). Tune the prompts, then
            generate.
          </Banner>
        }
      />
    );
  }

  return (
    <Intake
      beta
      label="Source footage"
      title="Start from a clip."
      copy="Upload a clip and generate variations, extensions, remasters, style transfers or a sequel — your footage conditions every shot (video-to-video)."
      next={["Source clip uploaded with the run", "Two scenes scaffolded", "Opens in the Director's Board", "Generate scene by scene"]}
    >
      <Drop accept="video/*" inputRef={fileRef} onPick={(f) => setFile(f)} name={name} empty="Upload a source clip — MP4 / MOV" />
      <Control name="Operation" value={op}>
        <div className="flex flex-wrap gap-1.5">
          {VIDEO_OPS.map((o) => (
            <Pill key={o} active={op === o} onClick={() => setOp(o)}>{o}</Pill>
          ))}
        </div>
      </Control>
      <button
        type="button"
        onClick={() => setScenes([newDraft(0, op, `${op} of the source clip.`), newDraft(1, "Continuation", "Carry the look and motion forward.")])}
        disabled={!name}
        className="cf-btn-ink mt-9"
      >
        Scaffold scenes →
      </button>
    </Intake>
  );
}

/* ── shared bits ─────────────────────────────────────────────── */

/** The intake layout every entry mode shares: material | what happens next. */
function Intake({
  label,
  title,
  copy,
  next,
  beta,
  children,
}: {
  label: string;
  title: string;
  copy: string;
  next: string[];
  beta?: boolean;
  children: ReactNode;
}) {
  return (
    <Split>
      <Cell className="lg:min-h-[520px]">
        <div className="flex items-center gap-3">
          <span className="cf-label">{label}</span>
          {beta && <span className="cf-label text-cf-warn">Beta</span>}
        </div>
        <h2 className="cf-display mt-9 text-[clamp(32px,3.4vw,45px)] leading-none">{title}</h2>
        <p className="mb-10 mt-3 max-w-[600px] text-[13px] leading-[1.7] text-cf-muted">{copy}</p>
        {children}
      </Cell>
      <Cell>
        <div className="cf-label">What happens next</div>
        <ol className="mt-9 border-t border-cf-line">
          {next.map((n, i) => (
            <li key={n} className="grid min-h-[60px] grid-cols-[40px_1fr] items-center gap-3 border-b border-cf-line">
              <span className="font-mono text-[9px] text-cf-muted">{String(i + 1).padStart(2, "0")}</span>
              <span className="font-serif text-[17px] leading-snug">{n}</span>
            </li>
          ))}
        </ol>
      </Cell>
    </Split>
  );
}

/** Banner shown above the Director's Board once an intake hands over its scenes. */
function Banner({ children, tone }: { children: ReactNode; tone?: "beta" }) {
  return (
    <div className={`border-l-2 bg-cf-soft px-5 py-4 text-[12px] leading-relaxed ${tone === "beta" ? "border-cf-warn" : "border-cf-accent"}`}>
      {tone === "beta" && <span className="cf-label mr-2 text-cf-warn">Beta</span>}
      {children}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="cf-option min-w-[44px] text-center">
      {children}
    </button>
  );
}

/** A file well for audio / video sources. */
function Drop({
  accept,
  inputRef,
  onPick,
  name,
  empty,
}: {
  accept: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: (f: File | null) => void;
  name: string | null;
  empty: string;
}) {
  return (
    <div className="border border-dashed border-cf-line px-6 py-10 text-center">
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      <p className="font-serif text-[22px] leading-tight">{name ?? empty}</p>
      {name && <p className="cf-label mt-2">Loaded</p>}
      <button type="button" onClick={() => inputRef.current?.click()} className="cf-btn-line mt-5">
        {name ? "Choose another" : "Choose file"}
      </button>
    </div>
  );
}
