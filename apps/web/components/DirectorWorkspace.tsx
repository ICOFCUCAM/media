"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadBible, loadConversation, loadDecisions, loadScenes, loadTimeline, sendInstruction,
  type Bible, type ChatMessage, type Decision, type TimelineBar, type WorkspaceScene,
} from "../lib/workspace";
import { signedUrl } from "../lib/storyboard";
import { useCapabilities } from "../lib/truth";
import { Status } from "./cf/primitives";
import { EditorPanel } from "./EditorPanel";

const TASK_LABEL: Record<string, string> = {
  film_plan: "Plan", film_plan_revision: "Plan revision", visual_review: "Frame review",
  translation: "Translation", social_kit: "Launch kit", edit_interpret: "Instruction", editorial: "Editor",
};
const BAR_TONE: Record<string, string> = {
  scene: "bg-cf-fg/15", shot: "bg-cf-accent/40", dialogue: "bg-sky-500/40", narration: "bg-amber-500/40", music_cue: "bg-emerald-500/30",
};

/**
 * The Director workspace (DirectorOS W9; Part 2 §90–92): bible and assets ·
 * scenes and shots · the Director, with the film's timeline across the top and
 * every AI decision with its "why". Instructions in the chat become edit
 * requests, so they pass canon, locks and passes like any other edit. Only
 * what the Capability Registry says works is offered.
 */
export function DirectorWorkspace({ projectId }: { projectId: string }) {
  const caps = useCapabilities();
  const [bible, setBible] = useState<Bible | null>(null);
  const [scenes, setScenes] = useState<WorkspaceScene[]>([]);
  const [timeline, setTimeline] = useState<Awaited<ReturnType<typeof loadTimeline>> | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [chat, setChat] = useState<ChatMessage[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const [b, s, d, c] = await Promise.all([loadBible(projectId), loadScenes(projectId), loadDecisions(projectId), loadConversation(projectId)]);
    setBible(b);
    setScenes(s);
    setDecisions(d);
    setChat(c);
    setTimeline(await loadTimeline(projectId, s));
  }, [projectId]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => chatEnd.current?.scrollIntoView({ block: "nearest" }), [chat?.length]);

  const scene = useMemo(() => scenes.find((s) => s.id === selected) ?? scenes[0] ?? null, [scenes, selected]);
  useEffect(() => {
    const keys = (scene?.shots ?? []).map((s) => s.thumb ?? s.still).filter((k): k is string => !!k && !urls[k]);
    if (!keys.length) return;
    void Promise.all(keys.map(async (k) => [k, await signedUrl(k)] as const)).then((e) =>
      setUrls((u) => ({ ...u, ...Object.fromEntries(e.filter((x): x is readonly [string, string] => !!x[1])) })));
  }, [scene, urls]);

  // Registry-real only (W1): the chat needs a planning model.
  const chatOff = caps.state === "loaded" && !caps.byId.film_planning?.real_execution;

  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      await sendInstruction(projectId, draft);
      setDraft("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  const total = timeline?.durationSec || 1;
  return (
    <div className="space-y-6">
      {/* Timeline strip */}
      <section aria-label="Timeline" className="border-t border-cf-fg pt-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="cf-label text-cf-fg">Timeline</span>
          <span className="cf-label">
            {timeline?.source === "timeline" ? `Production timeline v${timeline.version} · ${timeline.status}` : "Planned lengths (no timeline built yet)"} · {Math.round(total)}s
          </span>
        </div>
        {(["scene", "shot", "dialogue", "narration", "music_cue"] as const).map((kind) => {
          const bars = (timeline?.bars ?? []).filter((b) => b.kind === kind);
          if (!bars.length) return null;
          return (
            <div key={kind} className="relative mb-1 h-5 overflow-hidden rounded bg-cf-panel" aria-label={`${kind} track`}>
              {bars.map((b: TimelineBar, i) => (
                <div
                  key={i}
                  title={`${b.label} · ${b.startSec.toFixed(1)}–${b.endSec.toFixed(1)}s`}
                  className={`absolute top-0 h-full border-r border-cf-bg ${BAR_TONE[kind]}`}
                  style={{ left: `${(b.startSec / total) * 100}%`, width: `${Math.max(0.3, ((b.endSec - b.startSec) / total) * 100)}%` }}
                />
              ))}
            </div>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Bible & assets */}
        <section aria-label="Bible" className="min-w-0 border-t border-cf-fg pt-3">
          <span className="cf-label text-cf-fg">Bible</span>
          {!bible ? (
            <p className="mt-3 text-[12px] text-cf-muted">No Film IR for this production (planned before DirectorOS, or not planned yet).</p>
          ) : (
            <div className="mt-3 space-y-5">
              {bible.logline && <p className="text-[13px] italic leading-relaxed text-cf-muted">{bible.logline}</p>}
              <div>
                <h3 className="cf-label mb-2">Cast</h3>
                <ul className="space-y-3">
                  {bible.characters.map((c) => (
                    <li key={c.id} className="text-[12px] leading-relaxed">
                      <p className="text-[14px] font-semibold">{c.name} <span className="font-normal text-cf-muted">· {c.role}{c.age !== null ? ` · ${c.age}` : ""}</span></p>
                      {c.identity.face && <p className="text-cf-muted">{c.identity.face}</p>}
                      {c.identity.marks && c.identity.marks.length > 0 && <p className="text-cf-muted">Marks: {c.identity.marks.join(", ")}</p>}
                      <p className="text-cf-muted">Wardrobe: {c.wardrobe.map((w) => w.description).join(" / ")}</p>
                      {c.voice && <p className="text-cf-muted">Voice: {c.voice}</p>}
                    </li>
                  ))}
                </ul>
              </div>
              {bible.locations.length > 0 && (
                <div>
                  <h3 className="cf-label mb-2">Locations</h3>
                  <ul className="space-y-1 text-[12px] text-cf-muted">{bible.locations.map((l) => <li key={l.id}><span className="text-cf-fg">{l.name}</span> — {l.description}</li>)}</ul>
                </div>
              )}
              {bible.props.length > 0 && (
                <div>
                  <h3 className="cf-label mb-2">Props</h3>
                  <ul className="space-y-1 text-[12px] text-cf-muted">{bible.props.map((p) => <li key={p.id}><span className="text-cf-fg">{p.name}</span> — {p.description}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Scenes & shots */}
        <section aria-label="Scenes and shots" className="min-w-0 border-t border-cf-fg pt-3">
          <span className="cf-label text-cf-fg">Scenes &amp; shots</span>
          <ol className="mt-3 flex gap-1 overflow-x-auto pb-1">
            {scenes.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={scene?.id === s.id}
                  onClick={() => setSelected(s.id)}
                  className="cf-option whitespace-nowrap px-2.5 py-1 text-[12px]"
                >
                  {String(s.index + 1).padStart(2, "0")}
                </button>
              </li>
            ))}
          </ol>
          {scene && (
            <div className="mt-3">
              <p className="text-[14px] font-semibold">{scene.heading}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-cf-muted">{scene.summary}</p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {scene.shots.map((sh) => {
                  const key = sh.thumb ?? sh.still;
                  return (
                    <li key={sh.id} className="overflow-hidden rounded border border-cf-line">
                      <div className="aspect-video bg-cf-panel">
                        {key && urls[key] ? (
                          /* Plain <img>: a signed, short-lived storage URL. */
                          <img src={urls[key]} alt={`Shot ${sh.index + 1}`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[11px] text-cf-dim">No frame yet</div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 p-2 text-[11px]">
                        <span className="font-mono">Shot {sh.index + 1} · {sh.durationSec}s</span>
                        <Status tone={sh.status === "READY" ? "ok" : sh.status === "FAILED" ? "danger" : "idle"}>{sh.status}</Status>
                      </div>
                      {sh.camera && <p className="px-2 pb-2 text-[11px] text-cf-muted">{sh.camera}</p>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* The Director */}
        <section aria-label="Director" className="min-w-0 border-t border-cf-fg pt-3">
          <span className="cf-label text-cf-fg">Director</span>
          {chat === null ? (
            <p className="mt-3 text-[12px] text-cf-muted">The Director chat opens once migration 0042 is applied.</p>
          ) : (
            <>
              <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {chat.length === 0 && <p className="text-[12px] text-cf-muted">Tell the Director what to change — “give Maya a red coat from the harbour on”, “she has a cut above her eye after the fight”, “make the opening 15 seconds faster”.</p>}
                {chat.map((m) => (
                  <div key={m.id} className={`rounded px-3 py-2 text-[13px] leading-relaxed ${m.author === "owner" ? "ml-6 bg-cf-panel" : "mr-6 border border-cf-line"}`}>
                    {m.body}
                    {m.author === "owner" && m.status === "pending" && <span className="mt-1 block text-[11px] text-cf-dim">Reading…</span>}
                    {m.editRequestId && <span className="mt-1 block text-[11px] text-cf-muted">Change filed — see “Change the film” on the production page.</span>}
                  </div>
                ))}
                <div ref={chatEnd} />
              </div>
              {chatOff ? (
                <p className="mt-3 text-[12px] text-cf-muted">The AI Director is not configured, so instructions can't be read right now.</p>
              ) : (
                <div className="mt-3 flex gap-2">
                  <input
                    aria-label="Instruction to the Director"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                    placeholder="Change something…"
                    maxLength={2000}
                    className="cf-input flex-1 py-1.5 text-[13px]"
                  />
                  <button type="button" disabled={sending || !draft.trim()} onClick={() => void send()} className="cf-btn-ink px-3 py-1.5">Send</button>
                </div>
              )}
              {error && <p role="alert" className="mt-2 text-[12px] text-cf-danger">{error}</p>}
            </>
          )}

          <h3 className="cf-label mb-2 mt-6">Decision log</h3>
          {decisions.length === 0 ? (
            <p className="text-[12px] text-cf-muted">No AI decisions recorded for this production yet.</p>
          ) : (
            <ol className="space-y-2">
              {decisions.map((d) => (
                <li key={d.id} className="border-b border-cf-line pb-2 text-[12px] leading-relaxed">
                  <div className="flex flex-wrap items-center gap-2">
                    <Status tone={d.outcome === "ok" ? "ok" : d.outcome === "invalid" ? "warn" : "danger"}>{TASK_LABEL[d.task] ?? d.task}</Status>
                    <span className="font-mono text-[11px] text-cf-dim">{new Date(d.createdAt).toLocaleString()} · {d.model ?? d.provider ?? "—"}</span>
                  </div>
                  <p className="mt-1 text-cf-muted">{d.summary ?? (d.outcome === "error" ? `Failed: ${d.errorCode}` : "No summary recorded (decisions before the workspace).")}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* The Editor (W13): reviews the whole cut and proposes structured edits. */}
      <EditorPanel projectId={projectId} enabled={!chatOff} />
    </div>
  );
}
