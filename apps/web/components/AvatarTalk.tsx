"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { LANGUAGES } from "../lib/system";
import { signedUrl } from "../lib/storyboard";
import { listConversations, loadTurns, say, startConversation, TURN_LABEL, type Conversation, type Turn } from "../lib/avatar-talk";

/**
 * Talk with an avatar (DirectorOS W26; Part 3 §111, §117 "Conversation"):
 * speak or type; the avatar answers in its persona, in the chosen voice, and
 * — with a portrait — on camera. Each reply takes as long as a reading and a
 * talking-avatar video take; the page follows it.
 */
export function AvatarTalk({ voices }: { voices: { id: string; name: string }[] }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await listConversations();
    setConversations(list);
    if (list?.length && !active) setActive(list[0]!.id);
  }, [active]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!active) return;
    const load = () => void loadTurns(active).then(setTurns);
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [active]);

  if (conversations === null) return null; // before migration 0059 (or signed out)
  const current = conversations.find((c) => c.id === active) ?? null;

  return (
    <section aria-labelledby="talk" className="mb-12 border-t border-cf-fg pt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="talk" className="cf-label text-cf-fg">Talk with an avatar</h2>
        {conversations.length > 0 && (
          <select aria-label="Conversation" className="cf-input w-auto py-1.5" value={active ?? ""} onChange={(e) => setActive(e.target.value || null)}>
            {conversations.map((c) => <option key={c.id} value={c.id}>{c.title || c.persona.slice(0, 40)}</option>)}
            <option value="">+ New conversation</option>
          </select>
        )}
      </div>
      {error && <p role="alert" className="mb-3 text-[12px] text-cf-danger">{error}</p>}
      {current && user ? (
        <Thread turns={turns} onSay={async (line) => { setError(null); try { await say(user.id, current.id, line); setTurns(await loadTurns(current.id)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }} />
      ) : (
        user && <NewConversation voices={voices} onStart={async (c, portrait) => {
          setError(null);
          try { const id = await startConversation(user.id, c, portrait); await refresh(); setActive(id); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        }} />
      )}
    </section>
  );
}

function NewConversation({ voices, onStart }: { voices: { id: string; name: string }[]; onStart: (c: Omit<Conversation, "id" | "imageKey">, portrait: File | null) => Promise<void> }) {
  const [persona, setPersona] = useState("");
  const [title, setTitle] = useState("");
  const [voiceId, setVoiceId] = useState<string>(voices[0]?.id ?? "");
  const [language, setLanguage] = useState("en");
  const [quality, setQuality] = useState<"standard" | "premium">("standard");
  const [busy, setBusy] = useState(false);
  const portrait = useRef<HTMLInputElement>(null);
  return (
    <form className="grid max-w-xl gap-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onStart({ title, persona, voiceId: voiceId || null, language, quality }, portrait.current?.files?.[0] ?? null); setBusy(false); }}>
      <input className="cf-input" placeholder="Name (e.g. Ms Ada, chemistry tutor)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Name" />
      <textarea className="cf-input resize-y" rows={3} required placeholder="Who the avatar is: how it speaks, what it knows, how it behaves." value={persona} onChange={(e) => setPersona(e.target.value)} aria-label="Persona" />
      <div className="grid gap-3 sm:grid-cols-3">
        <select className="cf-input py-2" value={voiceId} onChange={(e) => setVoiceId(e.target.value)} aria-label="Voice">
          {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          <option value="">Built-in voice</option>
        </select>
        <select className="cf-input py-2" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
        <select className="cf-input py-2" value={quality} onChange={(e) => setQuality(e.target.value as "standard" | "premium")} aria-label="Video quality">
          <option value="standard">Standard video</option>
          <option value="premium">Premium video</option>
        </select>
      </div>
      <label className="text-[12px] text-cf-muted">Portrait (optional — without one the avatar only speaks)
        <input ref={portrait} type="file" accept="image/*" className="mt-1 block text-[12px]" />
      </label>
      <button type="submit" className="cf-btn-ink" disabled={busy || !persona.trim()}>{busy ? "Starting…" : "Start the conversation"}</button>
    </form>
  );
}

function Thread({ turns, onSay }: { turns: Turn[]; onSay: (line: { text?: string; recording?: Blob }) => Promise<void> }) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  async function toggleRecord() {
    if (recording) { recorder.current?.stop(); return; }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const r = new MediaRecorder(stream);
    chunks.current = [];
    r.ondataavailable = (e) => chunks.current.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      void onSay({ recording: new Blob(chunks.current, { type: r.mimeType || "audio/webm" }) });
    };
    recorder.current = r;
    r.start();
    setRecording(true);
  }

  return (
    <div className="max-w-2xl">
      <ol className="mb-4 grid gap-3">
        {turns.map((t) => <TurnView key={t.id} turn={t} />)}
        {turns.length === 0 && <li className="text-[13px] text-cf-muted">Say hello — type, or press Record and speak.</li>}
      </ol>
      <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; const t = text; setText(""); await onSay({ text: t }); }}>
        <input className="cf-input flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something…" aria-label="Your line" />
        <button type="submit" className="cf-btn-ink px-4" disabled={!text.trim()}>Send</button>
        {typeof window !== "undefined" && "MediaRecorder" in window && (
          <button type="button" className="cf-btn-line px-4" onClick={() => void toggleRecord()} aria-pressed={recording}>{recording ? "Stop" : "Record"}</button>
        )}
      </form>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  const [media, setMedia] = useState<string | null>(null);
  useEffect(() => {
    const key = turn.videoKey ?? turn.audioKey;
    if (turn.status === "ready" && key) void signedUrl(key).then(setMedia);
  }, [turn.status, turn.videoKey, turn.audioKey]);
  const mine = turn.role === "user";
  return (
    <li className={`max-w-[85%] rounded-lg border border-cf-line p-3 ${mine ? "justify-self-end bg-cf-bg" : "justify-self-start"}`}>
      {turn.text && <p className="text-[14px] leading-relaxed">{turn.text}</p>}
      {!turn.text && mine && <p className="text-[13px] italic text-cf-muted">(recording)</p>}
      {media && turn.videoKey && <video controls autoPlay src={media} className="mt-2 aspect-video w-full rounded bg-black" aria-label="The avatar's reply" />}
      {media && !turn.videoKey && <audio controls autoPlay src={media} className="mt-2 w-full" aria-label="The avatar's reply" />}
      {(TURN_LABEL[turn.status] || turn.error) && (
        <p className={`mt-1 text-[11px] ${turn.status === "failed" ? "text-cf-danger" : "text-cf-muted"}`}>{turn.error ?? TURN_LABEL[turn.status]}</p>
      )}
    </li>
  );
}
