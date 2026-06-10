"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { AuthCard } from "./AuthCard";
import { getSupabase } from "../lib/supabase";
import { signedUrl } from "../lib/storyboard";
import { LANGUAGES } from "../lib/system";

/**
 * Voice Lab — clone your voice from a short sample, then have it read
 * anything (speeches, news, narration) in any supported language. Rows are
 * written PENDING; the worker clones/speaks and flips them READY (docs/29).
 */

interface VoiceRow {
  id: string;
  user_id?: string;
  name: string;
  status: string;
  share_status?: string;
  share_terms?: string | null;
  error_message: string | null;
}
interface VoiceoverRow {
  id: string;
  title: string;
  language: string;
  status: string;
  audio_key: string | null;
  error_message: string | null;
  voice_id: string | null;
}

const BUCKET = "cineforge-assets";

export function VoiceLab() {
  const { enabled, loading, user, profile } = useAuth();
  const isAdmin = profile?.role === "ADMIN";
  const [voices, setVoices] = useState<VoiceRow[] | null>(null);
  const [community, setCommunity] = useState<VoiceRow[] | null>(null);
  const [pendingReview, setPendingReview] = useState<VoiceRow[] | null>(null);
  const [voiceovers, setVoiceovers] = useState<VoiceoverRow[] | null>(null);

  // New-voice form
  const [voiceName, setVoiceName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [cloneBusy, setCloneBusy] = useState(false);

  // New-voiceover form
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState<string>("");
  const [language, setLanguage] = useState("en");
  const [speakBusy, setSpeakBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !user) return;
    const [v, vo] = await Promise.all([
      sb
        .from("voices")
        .select("id,user_id,name,status,share_status,share_terms,error_message")
        .order("created_at", { ascending: false }),
      sb
        .from("voiceovers")
        .select("id,title,language,status,audio_key,error_message,voice_id")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);
    const rows = (v.data ?? []) as VoiceRow[];
    setVoices(rows.filter((r) => r.user_id === user.id));
    setCommunity(rows.filter((r) => r.user_id !== user.id && r.share_status === "APPROVED" && r.status === "READY"));
    setPendingReview(rows.filter((r) => r.share_status === "PENDING_REVIEW"));
    if (vo.data) setVoiceovers(vo.data as VoiceoverRow[]);
  }, [user]);

  // Light polling keeps statuses live while the worker clones/speaks.
  useEffect(() => {
    if (!user) return;
    void refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [user, refresh]);

  async function onClone(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    const file = fileRef.current?.files?.[0];
    if (!sb || !user || !file || cloneBusy) return;
    setCloneBusy(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp3";
      const key = `voices/${user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from(BUCKET).upload(key, file, { upsert: true });
      if (up.error) throw new Error(up.error.message);
      const ins = await sb.from("voices").insert({ user_id: user.id, name: voiceName, sample_key: key });
      if (ins.error) throw new Error(ins.error.message);
      setVoiceName("");
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setCloneBusy(false);
    }
  }

  async function onSpeak(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !user || speakBusy) return;
    setSpeakBusy(true);
    setError(null);
    try {
      const ins = await sb.from("voiceovers").insert({
        user_id: user.id,
        voice_id: voiceId || null,
        title: title || "Untitled speech",
        text,
        language,
      });
      if (ins.error) throw new Error(ins.error.message);
      setTitle("");
      setText("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to queue voiceover");
    } finally {
      setSpeakBusy(false);
    }
  }

  async function offerVoice(id: string) {
    const sb = getSupabase();
    if (!sb) return;
    const terms = window.prompt(
      "Your terms for community use (e.g. 'Free for non-commercial', 'Credit me as …'):",
    );
    if (terms === null) return;
    await sb.from("voices").update({ share_status: "PENDING_REVIEW", share_terms: terms }).eq("id", id);
    await refresh();
  }

  async function reviewVoice(id: string, approve: boolean) {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("voices").update({ share_status: approve ? "APPROVED" : "REJECTED" }).eq("id", id);
    await refresh();
  }

  const readyVoices = [...(voices ?? []).filter((v) => v.status === "READY"), ...(community ?? [])];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Voices</h1>
        <p className="mt-1 text-sm text-white/55">
          Clone your voice from a short sample, then have it read speeches, news or narration — in any of{" "}
          {LANGUAGES.length} languages.
        </p>
      </header>

      {!enabled ? (
        <Note>Connect Supabase to use the Voice Lab.</Note>
      ) : loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : !user ? (
        <AuthCard title="Sign in to clone voices" />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
          <div className="space-y-6">
            <form onSubmit={onClone} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-sm font-semibold">Clone a voice</h2>
              <p className="text-xs text-white/45">
                Upload 10–60 seconds of clear speech (mp3/wav/m4a). The clone appears below in ~1 minute.
              </p>
              <input
                value={voiceName}
                onChange={(e) => setVoiceName(e.target.value)}
                placeholder="Voice name (e.g. My voice)"
                required
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-white/30"
              />
              <input
                ref={fileRef}
                type="file"
                accept="audio/*"
                required
                className="w-full text-xs text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:text-white"
              />
              <button
                type="submit"
                disabled={cloneBusy || !voiceName}
                className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
              >
                {cloneBusy ? "Uploading…" : "Clone voice"}
              </button>
              <div className="space-y-1.5">
                {(voices ?? []).map((v) => (
                  <div key={v.id} className="rounded-lg border border-white/10 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="truncate">{v.name}</span>
                      <StatusChip status={v.status} error={v.error_message} />
                    </div>
                    {v.status === "READY" && (
                      <div className="mt-1 text-[11px] text-white/40">
                        {v.share_status === "APPROVED" ? (
                          "✓ shared with the community"
                        ) : v.share_status === "PENDING_REVIEW" ? (
                          "awaiting admin approval"
                        ) : v.share_status === "REJECTED" ? (
                          "sharing rejected"
                        ) : (
                          <button type="button" onClick={() => offerVoice(v.id)} className="text-sky-300/80 hover:text-sky-200">
                            Offer to community →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </form>

            <form onSubmit={onSpeak} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-sm font-semibold">Read a speech</h2>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (e.g. Independence Day address)"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-white/30"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/30"
                >
                  <option value="">Narrator (stock)</option>
                  {readyVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-white/30"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the speech, news script or any long text…"
                required
                rows={7}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-white/30"
              />
              <button
                type="submit"
                disabled={speakBusy || !text.trim()}
                className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
              >
                {speakBusy ? "Queuing…" : "Generate audio"}
              </button>
              {error && <p className="text-xs text-amber-300">{error}</p>}
            </form>
          </div>

          <div>
            {isAdmin && (pendingReview?.length ?? 0) > 0 && (
              <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
                <h2 className="mb-2 text-sm font-semibold text-amber-200">Voice submissions awaiting review</h2>
                <div className="space-y-2">
                  {pendingReview!.map((v) => (
                    <div key={v.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate">{v.name}</div>
                        <div className="truncate text-[11px] text-white/45">Terms: {v.share_terms || "—"}</div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button onClick={() => reviewVoice(v.id, true)} className="rounded-lg bg-emerald-400 px-3 py-1 text-xs font-semibold text-black">
                          Approve
                        </button>
                        <button onClick={() => reviewVoice(v.id, false)} className="rounded-lg border border-white/20 px-3 py-1 text-xs">
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(community?.length ?? 0) > 0 && (
              <div className="mb-6">
                <h2 className="mb-2 text-sm font-semibold text-white/70">Community voices</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {community!.map((v) => (
                    <div key={v.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
                      <div className="truncate">{v.name}</div>
                      <div className="truncate text-[11px] text-white/40" title={v.share_terms ?? undefined}>
                        {v.share_terms || "No terms specified"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <h2 className="mb-3 text-sm font-semibold text-white/70">Your audio</h2>
            {!voiceovers ? (
              <p className="text-sm text-white/40">Loading…</p>
            ) : voiceovers.length === 0 ? (
              <Note>Nothing yet. Clone a voice (or use the stock narrator) and generate your first reading on the left.</Note>
            ) : (
              <div className="space-y-3">
                {voiceovers.map((vo) => (
                  <VoiceoverCard key={vo.id} row={vo} voices={voices ?? []} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function VoiceoverCard({ row, voices }: { row: VoiceoverRow; voices: VoiceRow[] }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (row.status === "READY" && row.audio_key) void signedUrl(row.audio_key).then(setUrl);
  }, [row.status, row.audio_key]);
  const voiceName = voices.find((v) => v.id === row.voice_id)?.name ?? "Narrator";
  const lang = LANGUAGES.find((l) => l.code === row.language)?.name ?? row.language;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{row.title}</div>
          <div className="text-xs text-white/45">
            {voiceName} · {lang}
          </div>
        </div>
        <StatusChip status={row.status} error={row.error_message} />
      </div>
      {url && <audio controls src={url} className="mt-3 w-full" />}
    </div>
  );
}

function StatusChip({ status, error }: { status: string; error: string | null }) {
  const cls =
    status === "READY"
      ? "bg-emerald-500/15 text-emerald-300"
      : status === "FAILED"
        ? "bg-red-500/15 text-red-300"
        : "bg-amber-500/15 text-amber-300";
  return (
    <span title={error ?? undefined} className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>
      {status === "READY" ? "ready" : status === "FAILED" ? "failed" : "working…"}
    </span>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-white/55">{children}</div>;
}
