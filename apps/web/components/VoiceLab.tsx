"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { StudioGate } from "./cf/StudioGate";
import { CinemaArt } from "./cf/CinemaArt";
import { Control, EmptyState, PageHeader, Section, Status } from "./cf/primitives";
import { getSupabase } from "../lib/supabase";
import { signedUrl } from "../lib/storyboard";
import { LANGUAGES } from "../lib/system";
import { QuickVoice } from "./QuickVoice";
import { AvatarTalk } from "./AvatarTalk";
import { DEFAULT_DELIVERY, EMOTIONS, MAX_SPEAKERS, READING_MODES, deliveryStyle, scriptSpeakers, type Delivery, type ReadingMode } from "../lib/readings";

/**
 * Voice Studio (W9; was the Voice Lab) — clone your voice from a short sample, then have it read
 * anything (speeches, news, narration) in any supported language. Rows are
 * written PENDING; the worker clones/speaks and flips them READY (docs/29).
 * W15: readings have a mode (narrator, presenter, conversation) and delivery
 * controls, and a community voice is used only after accepting its owner's
 * terms (a per-use licence the database checks on every reading).
 */

interface VoiceRow {
  id: string;
  user_id?: string;
  name: string;
  status: string;
  share_status?: string;
  share_terms?: string | null;
  error_message: string | null;
  consent_type?: "self" | "authorised" | null;
  quality?: { quality?: "good" | "fair" | "poor"; issues?: string[]; duration_seconds?: number; speech_ratio?: number; noise_floor_dbfs?: number | null } | null;
}
interface AvatarRow {
  id: string;
  title: string;
  status: string;
  video_key: string | null;
  error_message: string | null;
  created_at: string;
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
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "ADMIN";
  const [voices, setVoices] = useState<VoiceRow[] | null>(null);
  const [community, setCommunity] = useState<VoiceRow[] | null>(null);
  const [pendingReview, setPendingReview] = useState<VoiceRow[] | null>(null);
  const [voiceovers, setVoiceovers] = useState<VoiceoverRow[] | null>(null);
  const [avatars, setAvatars] = useState<AvatarRow[] | null>(null);

  // Avatar form
  const portraitRef = useRef<HTMLInputElement>(null);
  const [avatarVoiceoverId, setAvatarVoiceoverId] = useState("");
  const [avatarQuality, setAvatarQuality] = useState<"standard" | "premium">("standard");
  const [avatarBusy, setAvatarBusy] = useState(false);

  // New-voice form
  const [voiceName, setVoiceName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [cloneBusy, setCloneBusy] = useState(false);
  // Consent is recorded with every voice; the Voice Engine refuses a voice without it.
  const [consentType, setConsentType] = useState<"self" | "authorised">("self");
  const [consented, setConsented] = useState(false);

  // New-voiceover form
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState<string>("");
  const [language, setLanguage] = useState("en");
  const [speakBusy, setSpeakBusy] = useState(false);
  const [mode, setMode] = useState<ReadingMode>("narrator");
  const [delivery, setDelivery] = useState<Delivery>(DEFAULT_DELIVERY);
  const [touched, setTouched] = useState<Partial<Record<keyof Delivery, boolean>>>({});
  const [speakerVoices, setSpeakerVoices] = useState<Record<string, string>>({});
  const [licensed, setLicensed] = useState<Set<string>>(new Set());
  const [licBusy, setLicBusy] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !user) return;
    const [v, vo] = await Promise.all([
      sb
        .from("voices")
        .select("id,user_id,name,status,share_status,share_terms,error_message,consent_type,quality")
        .order("created_at", { ascending: false }),
      sb
        .from("voiceovers")
        .select("id,title,language,status,audio_key,error_message,voice_id")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);
    const av = await sb
      .from("avatar_videos")
      .select("id,title,status,video_key,error_message,created_at")
      .order("created_at", { ascending: false })
      .limit(12);
    if (av.data) setAvatars(av.data as AvatarRow[]);
    const lic = await sb.from("voice_licences").select("voice_id").eq("licensee_id", user.id).is("revoked_at", null);
    if (lic.data) setLicensed(new Set(lic.data.map((l) => l.voice_id)));
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
    if (!sb || !user || !file || cloneBusy || !consented) return;
    setCloneBusy(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp3";
      const key = `voices/${user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from(BUCKET).upload(key, file, { upsert: true });
      if (up.error) throw new Error(up.error.message);
      const ins = await sb.from("voices").insert({
        user_id: user.id,
        name: voiceName,
        sample_key: key,
        consent_type: consentType,
        consent_confirmed_at: new Date().toISOString(),
      });
      if (ins.error) throw new Error(ins.error.message);
      setVoiceName("");
      setConsented(false);
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
      const conversation = mode === "conversation";
      const speakers = conversation
        ? scriptSpeakers(text).map((label) => {
            const v = speakerVoices[label.toLowerCase()];
            return v ? { label, voice_id: v } : { label };
          })
        : [];
      if (conversation && (speakers.length < 2 || speakers.length > MAX_SPEAKERS))
        throw new Error(`A conversation needs 2–${MAX_SPEAKERS} speakers, each line written as “Name: line”.`);
      const ins = await sb.from("voiceovers").insert({
        user_id: user.id,
        voice_id: conversation ? null : voiceId || null,
        title: title || "Untitled speech",
        text,
        language,
        mode,
        style: deliveryStyle(delivery, touched),
        speakers,
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

  async function onAvatar(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    const file = portraitRef.current?.files?.[0];
    if (!sb || !user || !file || avatarBusy || !avatarVoiceoverId) return;
    setAvatarBusy(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const key = `avatars/${user.id}/portrait-${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from(BUCKET).upload(key, file, { upsert: true });
      if (up.error) throw new Error(up.error.message);
      const vo = (voiceovers ?? []).find((v) => v.id === avatarVoiceoverId);
      const ins = await sb.from("avatar_videos").insert({
        user_id: user.id,
        voiceover_id: avatarVoiceoverId,
        title: vo?.title ?? "Avatar video",
        image_key: key,
        quality: avatarQuality,
      });
      if (ins.error) throw new Error(ins.error.message);
      if (portraitRef.current) portraitRef.current.value = "";
      setAvatarVoiceoverId("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Avatar failed");
    } finally {
      setAvatarBusy(false);
    }
  }

  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [offerTerms, setOfferTerms] = useState("");

  async function submitOffer(id: string) {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("voices").update({ share_status: "PENDING_REVIEW", share_terms: offerTerms }).eq("id", id);
    setOfferingId(null);
    setOfferTerms("");
    await refresh();
  }

  async function deleteRow(table: "avatar_videos" | "voiceovers", id: string) {
    if (!window.confirm("Delete this? The file stays in storage but it disappears from your library.")) return;
    const sb = getSupabase();
    if (!sb) return;
    await sb.from(table).delete().eq("id", id);
    await refresh();
  }

  async function reviewVoice(id: string, approve: boolean) {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("voices").update({ share_status: approve ? "APPROVED" : "REJECTED" }).eq("id", id);
    await refresh();
  }

  // A community voice is offered only once its terms are accepted (a per-use licence, W15).
  const readyVoices = [...(voices ?? []).filter((v) => v.status === "READY"), ...(community ?? []).filter((v) => licensed.has(v.id))];
  const speakersInScript = mode === "conversation" ? scriptSpeakers(text) : [];
  const setDel = <K extends keyof Delivery>(k: K, v: Delivery[K]) => {
    setDelivery((d) => ({ ...d, [k]: v }));
    setTouched((t) => ({ ...t, [k]: true }));
  };

  async function toggleLicence(v: VoiceRow) {
    const sb = getSupabase();
    if (!sb || licBusy) return;
    setLicBusy(v.id);
    setError(null);
    const r = licensed.has(v.id)
      ? await sb.rpc("revoke_voice_licence", { p_voice: v.id })
      : await sb.rpc("accept_voice_terms", { p_voice: v.id });
    if (r.error) setError(r.error.message);
    await refresh();
    setLicBusy(null);
  }

  const fileCls =
    "w-full";
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        art={false}
        eyebrow="Production / Voice Studio"
        title={<>Give the story<br />a <em>voice.</em></>}
        copy={
          <>
            <p>Clone a voice from a short sample, then have it read speeches, news or narration in any of {LANGUAGES.length} languages — and put it on camera.</p>
            <p><strong>Every recording is written by the worker and appears here when it is ready.</strong></p>
          </>
        }
        status={{ tone: "live", label: `${LANGUAGES.length} languages` }}
      />

      <div className="pt-12">
        <StudioGate signIn="Sign in to clone voices" what="Voices">
          {/* The one simple screen (W26; §176): the full departments are below it. */}
          <QuickVoice voices={readyVoices.map((v) => ({ id: v.id, name: v.name }))} onQueued={refresh} />
          {/* A live conversation with an avatar (W26; §111, §117). */}
          <AvatarTalk voices={readyVoices.map((v) => ({ id: v.id, name: v.name }))} />
          <Section label="01 — Departments" title="Record, read, perform.">
            {error && (
              <p role="alert" className="mb-5 border-l-2 border-cf-danger pl-3 text-[12px] text-cf-danger">
                {error}
              </p>
            )}
            <div className="grid gap-px border border-cf-line bg-cf-line lg:grid-cols-3">
              {/* Clone */}
              <form onSubmit={onClone} className="bg-cf-bg p-6">
                <Dept n="01" title="Clone a voice" copy="Upload 20–60 seconds of clear speech in a quiet room (mp3 / wav / m4a). The recording is checked first; the clone is ready in about a minute." />
                <label htmlFor="voice-name" className="cf-label mb-2 mt-7 block text-cf-fg">Voice name</label>
                <input id="voice-name" value={voiceName} onChange={(e) => setVoiceName(e.target.value)} placeholder="My voice" required className="cf-input" />
                <label htmlFor="voice-sample" className="cf-label mb-2 mt-5 block text-cf-fg">Sample</label>
                <input id="voice-sample" ref={fileRef} type="file" accept="audio/*" required className={fileCls} />
                <fieldset className="mt-5">
                  <legend className="cf-label mb-2 block text-cf-fg">Whose voice is this?</legend>
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="radio" name="consent-type" checked={consentType === "self"} onChange={() => setConsentType("self")} />
                    My own voice
                  </label>
                  <label className="mt-1 flex items-center gap-2 text-[13px]">
                    <input type="radio" name="consent-type" checked={consentType === "authorised"} onChange={() => setConsentType("authorised")} />
                    Someone who has authorised me to use it
                  </label>
                </fieldset>
                <label className="mt-4 flex items-start gap-2 text-[12px] leading-snug text-cf-muted">
                  <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} required className="mt-0.5" />
                  <span>
                    {consentType === "self"
                      ? "I confirm this recording is my own voice."
                      : "I confirm the speaker has given me permission to clone and use their voice."}{" "}
                    Voices are never cloned without this confirmation.
                  </span>
                </label>
                <button type="submit" disabled={cloneBusy || !voiceName || !consented} className="cf-btn-ink mt-7 w-full">
                  {cloneBusy ? "Uploading…" : "Clone voice"}
                </button>

                <ul className="mt-7 border-t border-cf-line">
                  {(voices ?? []).map((v) => (
                    <li key={v.id} className="border-b border-cf-line py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-display font-semibold text-[17px]">{v.name}</span>
                        <StatusChip status={v.status} error={v.error_message} />
                      </div>
                      <VoiceFacts v={v} />
                      {v.status === "READY" && (
                        <div className="mt-2 text-[11px] text-cf-muted">
                          {v.share_status === "APPROVED" ? (
                            "Shared with the community"
                          ) : v.share_status === "PENDING_REVIEW" ? (
                            "Awaiting admin approval"
                          ) : v.share_status === "REJECTED" ? (
                            "Sharing rejected"
                          ) : offeringId === v.id ? (
                            <span className="mt-1 flex gap-1.5">
                              <input
                                value={offerTerms}
                                onChange={(e) => setOfferTerms(e.target.value)}
                                placeholder="Your terms — e.g. free non-commercial, credit me"
                                aria-label={`Sharing terms for ${v.name}`}
                                className="cf-input flex-1 px-2 py-1.5 text-[11px]"
                              />
                              <button type="button" onClick={() => void submitOffer(v.id)} className="cf-btn-ink px-3 py-1.5">
                                Offer
                              </button>
                              <button type="button" onClick={() => setOfferingId(null)} aria-label="Cancel offer" className="cf-btn-line px-3 py-1.5">
                                ×
                              </button>
                            </span>
                          ) : (
                            <button type="button" onClick={() => setOfferingId(v.id)} className="cf-link text-cf-muted hover:text-cf-fg">
                              Offer to the community →
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </form>

              {/* Read */}
              <form onSubmit={onSpeak} className="bg-cf-bg p-6">
                <Dept n="02" title="Read a speech" copy="Any length — speeches, news scripts, narration, a conversation — in your clone, a licensed community voice or a built-in voice." />
                <label htmlFor="vo-title" className="cf-label mb-2 mt-7 block text-cf-fg">Title</label>
                <input id="vo-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Independence Day address" className="cf-input" />
                <Control name="Mode" value={READING_MODES.find((m) => m.id === mode)?.label ?? mode}>
                  <div className="grid grid-cols-3 gap-1.5">
                    {READING_MODES.map((m) => (
                      <button key={m.id} type="button" onClick={() => setMode(m.id)} aria-pressed={mode === m.id} title={m.hint} className="cf-option">
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-cf-muted">{READING_MODES.find((m) => m.id === mode)?.hint}</p>
                </Control>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 sm:gap-2 lg:grid-cols-1 lg:gap-4 2xl:grid-cols-2 2xl:gap-2">
                  {mode !== "conversation" && <label className="block">
                    <span className="cf-label mb-2 block text-cf-fg">Voice</span>
                    <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className="cf-input py-2.5">
                      <option value="">Built-in voice</option>
                      {readyVoices.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </label>}
                  <label className="block">
                    <span className="cf-label mb-2 block text-cf-fg">Language</span>
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} className="cf-input py-2.5">
                      {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>{l.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label htmlFor="vo-text" className="cf-label mb-2 mt-5 block text-cf-fg">Text</label>
                <textarea
                  id="vo-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={mode === "conversation" ? "Ada: Did you see the launch?\nBen: I did — the whole town was watching." : "Paste the speech, news script or any long text…"}
                  required
                  rows={7}
                  className="cf-input resize-y"
                />
                {mode === "conversation" && (
                  <div className="mt-4">
                    <span className="cf-label mb-2 block text-cf-fg">Speakers</span>
                    {speakersInScript.length === 0 ? (
                      <p className="text-[11px] text-cf-muted">Write each line as “Name: line” — the speakers appear here.</p>
                    ) : (
                      <ul className="grid gap-2">
                        {speakersInScript.map((label, i) => (
                          <li key={label} className="flex items-center gap-2">
                            <span className={`w-24 truncate text-[13px] ${i >= MAX_SPEAKERS ? "text-cf-danger" : ""}`}>{label}</span>
                            <select
                              aria-label={`Voice for ${label}`}
                              value={speakerVoices[label.toLowerCase()] ?? ""}
                              onChange={(e) => setSpeakerVoices((m) => ({ ...m, [label.toLowerCase()]: e.target.value }))}
                              className="cf-input flex-1 py-2"
                            >
                              <option value="">Built-in voice</option>
                              {readyVoices.map((v) => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                              ))}
                            </select>
                          </li>
                        ))}
                      </ul>
                    )}
                    {speakersInScript.length > MAX_SPEAKERS && <p className="mt-1.5 text-[11px] text-cf-danger">Up to {MAX_SPEAKERS} speakers.</p>}
                  </div>
                )}
                <details className="mt-5">
                  <summary className="cf-label cursor-pointer text-cf-fg">Delivery</summary>
                  <div className="mt-3 grid gap-3">
                    <label className="block">
                      <span className="cf-label mb-1 block">Emotion</span>
                      <select value={delivery.emotion} onChange={(e) => setDel("emotion", e.target.value as Delivery["emotion"])} className="cf-input py-2">
                        {EMOTIONS.map((em) => (
                          <option key={em} value={em}>{em[0]!.toUpperCase() + em.slice(1)}</option>
                        ))}
                      </select>
                    </label>
                    <Slider label="Energy" value={delivery.energy} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setDel("energy", v)} />
                    <Slider label="Speed" value={delivery.speed} min={0.75} max={1.5} step={0.05} show={(v) => `${v.toFixed(2)}×`} onChange={(v) => setDel("speed", v)} />
                    <Slider label="Pitch" value={delivery.pitch} min={-6} max={6} step={1} show={(v) => `${v > 0 ? "+" : ""}${v} st`} onChange={(v) => setDel("pitch", v)} />
                    <p className="text-[11px] text-cf-muted">Untouched controls follow the mode. Engines that cannot change one of these ignore it.</p>
                  </div>
                </details>
                <button type="submit" disabled={speakBusy || !text.trim()} className="cf-btn-ink mt-7 w-full">
                  {speakBusy ? "Queuing…" : "Generate audio"}
                </button>
              </form>

              {/* Perform */}
              <form onSubmit={onAvatar} className="bg-cf-bg p-6">
                <Dept n="03" title="Talking avatar" copy="Upload a front-facing portrait and pick a finished reading — the photo speaks it on video. Best under a minute." />
                <label htmlFor="avatar-portrait" className="cf-label mb-2 mt-7 block text-cf-fg">Portrait</label>
                <input id="avatar-portrait" ref={portraitRef} type="file" accept="image/*" required className={fileCls} />
                <label htmlFor="avatar-reading" className="cf-label mb-2 mt-5 block text-cf-fg">Reading</label>
                <select id="avatar-reading" value={avatarVoiceoverId} onChange={(e) => setAvatarVoiceoverId(e.target.value)} required className="cf-input py-2.5">
                  <option value="">Pick a finished reading…</option>
                  {(voiceovers ?? [])
                    .filter((v) => v.status === "READY")
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.title} ({LANGUAGES.find((l) => l.code === v.language)?.name ?? v.language})
                      </option>
                    ))}
                </select>
                <Control name="Quality" value={avatarQuality}>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["standard", "premium"] as const).map((q) => (
                      <button key={q} type="button" onClick={() => setAvatarQuality(q)} aria-pressed={avatarQuality === q} className="cf-option">
                        {q === "premium" ? "Premium · ~$2–4" : "Standard · ~$0.15"}
                      </button>
                    ))}
                  </div>
                </Control>
                <button type="submit" disabled={avatarBusy || !avatarVoiceoverId} className="cf-btn-ink mt-7 w-full">
                  {avatarBusy ? "Uploading…" : "Create avatar video"}
                </button>
              </form>
            </div>
          </Section>

          <Section label="02 — Recordings" title="The voice archive.">
            {isAdmin && (pendingReview?.length ?? 0) > 0 && (
              <div className="mb-10 border-l-2 border-cf-warn pl-5">
                <div className="cf-label text-cf-warn">Voice submissions awaiting review · admin</div>
                <ul className="mt-3 border-t border-cf-line">
                  {pendingReview!.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-3 border-b border-cf-line py-3">
                      <div className="min-w-0">
                        <div className="truncate font-display font-semibold text-[17px]">{v.name}</div>
                        <div className="truncate text-[11px] text-cf-muted">Terms: {v.share_terms || "—"}</div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => reviewVoice(v.id, true)} className="cf-btn-accent px-3 py-2">
                          Approve
                        </button>
                        <button type="button" onClick={() => reviewVoice(v.id, false)} className="cf-btn-line px-3 py-2">
                          Reject
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(community?.length ?? 0) > 0 && (
              <div className="mb-10">
                <div className="cf-label mb-3">Community voices</div>
                <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-2 lg:grid-cols-3">
                  {community!.map((v) => (
                    <div key={v.id} className="bg-cf-bg px-4 py-3">
                      <div className="truncate font-display font-semibold text-[17px]">{v.name}</div>
                      <div className="text-[11px] text-cf-muted" title={v.share_terms ?? undefined}>
                        Terms: {v.share_terms || "none specified"}
                      </div>
                      <button
                        type="button"
                        onClick={() => void toggleLicence(v)}
                        disabled={licBusy === v.id}
                        className={licensed.has(v.id) ? "cf-link mt-2 text-[11px] text-cf-muted hover:text-cf-fg" : "cf-btn-line mt-2 px-3 py-1.5 text-[11px]"}
                      >
                        {licensed.has(v.id) ? "Licensed — stop using" : "Accept terms and use"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(avatars?.length ?? 0) > 0 && (
              <div className="mb-10">
                <div className="cf-label mb-3">Avatar videos</div>
                <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-2 lg:grid-cols-3">
                  {avatars!.map((av) => (
                    <AvatarCard key={av.id} row={av} onDelete={() => void deleteRow("avatar_videos", av.id)} />
                  ))}
                </div>
              </div>
            )}

            <div className="cf-label mb-3">Your audio</div>
            {!voiceovers ? (
              <p className="cf-label">Loading recordings…</p>
            ) : voiceovers.length === 0 ? (
              <EmptyState title={<>Nothing recorded <em>yet.</em></>} hint="Clone a voice (or use the stock narrator) and generate your first reading above." />
            ) : (
              <ul className="border-t border-cf-fg">
                {voiceovers.map((vo) => (
                  <VoiceoverCard key={vo.id} row={vo} voices={voices ?? []} onDelete={() => void deleteRow("voiceovers", vo.id)} />
                ))}
              </ul>
            )}
          </Section>
        </StudioGate>
      </div>
    </div>
  );
}

/**
 * What the Voice Engine knows about a voice (W7/W9): whose it is (consent),
 * how good the recording was and why, and where it can be used. Engine and
 * model names are never shown (Part 4 §174).
 */
function VoiceFacts({ v }: { v: VoiceRow }) {
  const q = v.quality;
  const tone = q?.quality === "good" ? "text-cf-ok" : q?.quality === "fair" ? "text-cf-warn" : "text-cf-danger";
  return (
    <div className="mt-1.5 space-y-0.5 text-[11px] leading-relaxed text-cf-muted">
      {v.consent_type && <p>{v.consent_type === "self" ? "Your own voice" : "Used with the speaker's permission"} · consent recorded</p>}
      {q?.quality && (
        <p>
          Recording: <span className={tone}>{q.quality}</span>
          {q.duration_seconds ? ` · ${Math.round(q.duration_seconds)}s` : ""}
          {q.speech_ratio !== undefined ? ` · ${Math.round(q.speech_ratio * 100)}% speech` : ""}
          {q.issues?.length ? ` — ${q.issues.slice(0, 2).join(" ")}` : ""}
        </p>
      )}
      {v.status === "READY" && <p>Give it to a character in the <Link href="/library/characters" className="underline hover:text-cf-fg">Casting Room</Link> to hear it in your films.</p>}
    </div>
  );
}

/** A department heading inside the voice room. */
function Dept({ n, title, copy }: { n: string; title: string; copy: string }) {
  return (
    <div>
      <span className="font-mono text-[11px] text-cf-muted">{n}</span>
      <h3 className="cf-display mt-4 text-[30px] leading-none">{title}</h3>
      <p className="mt-2 text-[12px] leading-relaxed text-cf-muted">{copy}</p>
    </div>
  );
}

function VoiceoverCard({ row, voices, onDelete }: { row: VoiceoverRow; voices: VoiceRow[]; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (row.status === "READY" && row.audio_key) void signedUrl(row.audio_key).then(setUrl);
  }, [row.status, row.audio_key]);
  const voiceName = voices.find((v) => v.id === row.voice_id)?.name ?? "Narrator";
  const lang = LANGUAGES.find((l) => l.code === row.language)?.name ?? row.language;
  return (
    <li className="grid gap-3 border-b border-cf-line py-4 md:grid-cols-[1fr_1.2fr_auto] md:items-center">
      <div className="min-w-0">
        <div className="truncate font-display font-semibold text-[19px]">{row.title}</div>
        <div className="cf-label mt-1">
          {voiceName} · {lang}
        </div>
      </div>
      <div>{url ? <audio controls src={url} className="h-9 w-full" aria-label={`Play ${row.title}`} /> : row.error_message && <p className="text-[11px] text-cf-danger">{row.error_message}</p>}</div>
      <span className="flex items-center justify-end gap-3">
        <StatusChip status={row.status} error={row.error_message} />
        <DeleteBtn label={row.title} onDelete={onDelete} />
      </span>
    </li>
  );
}

function AvatarCard({ row, onDelete }: { row: AvatarRow; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (row.status === "READY" && row.video_key) void signedUrl(row.video_key).then(setUrl);
  }, [row.status, row.video_key]);
  return (
    <div className="bg-cf-bg p-4">
      {url ? (
        <video controls src={url} className="aspect-video w-full bg-black" aria-label={`Avatar video: ${row.title}`} />
      ) : (
        <CinemaArt seed={row.title} scene="figure" className="aspect-video w-full rounded-md" hud={{ tag: row.status === "FAILED" ? "Failed" : "The worker is rendering" }} />
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="truncate font-display font-semibold text-[17px]">{row.title}</div>
        <span className="flex shrink-0 items-center gap-3">
          <StatusChip status={row.status} error={row.error_message} />
          <DeleteBtn label={row.title} onDelete={onDelete} />
        </span>
      </div>
      {row.error_message && <p className="mt-2 text-[11px] text-cf-danger">{row.error_message}</p>}
    </div>
  );
}

function DeleteBtn({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <button
      type="button"
      onClick={onDelete}
      title="Delete"
      aria-label={`Delete ${label}`}
      className="h-7 w-7 border border-transparent text-cf-dim transition hover:border-cf-danger hover:text-cf-danger"
    >
      ×
    </button>
  );
}

function StatusChip({ status, error }: { status: string; error: string | null }) {
  const tone = status === "READY" ? "ok" : status === "FAILED" ? "danger" : "warn";
  return (
    <span title={error ?? undefined}>
      <Status tone={tone}>{status === "READY" ? "Ready" : status === "FAILED" ? "Failed" : "Working"}</Status>
    </span>
  );
}

function Slider({ label, value, min, max, step, show, onChange }: { label: string; value: number; min: number; max: number; step: number; show: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="cf-label mb-1 flex justify-between"><span>{label}</span><span className="font-mono text-cf-fg">{show(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </label>
  );
}
