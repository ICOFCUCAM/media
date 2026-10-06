"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { StudioGate } from "./cf/StudioGate";
import { Cell, EmptyState, PageHeader, Section, SpecList, Split, Status } from "./cf/primitives";
import { getSupabase } from "../lib/supabase";
import { SkeletonRows } from "./Skeleton";

/**
 * The Distribution Desk (docs/design/distribution-desk-publish.html).
 * Social Launchpad (docs/31) — upload any video, the AI writes a per-platform
 * launch kit (title/description/hashtags tuned for each platform), then one
 * button posts it to every connected platform. Rows are written PENDING; the
 * worker builds the kit and performs the launch.
 */

const PLATFORM_META: Record<string, { label: string; hint: string }> = {
  youtube: { label: "YouTube", hint: "uploads as PRIVATE — review, then publish" },
  tiktok: { label: "TikTok", hint: "lands in your TikTok inbox to confirm" },
  instagram: { label: "Instagram", hint: "publishes as a Reel" },
  facebook: { label: "Facebook", hint: "posts to your Page" },
  x: { label: "X", hint: "needs paid API tier" },
};

interface LaunchRow {
  id: string;
  brief: string;
  status: string;
  kit: Record<string, { title: string; description: string; hashtags: string[] }> | null;
  results: Record<string, { status: string; url?: string; detail?: string }> | null;
  error_message: string | null;
  created_at: string;
}

const BUCKET = "cineforge-assets";

export function SocialLaunchpad() {
  const { user } = useAuth();
  const [launches, setLaunches] = useState<LaunchRow[] | null>(null);
  const [films, setFilms] = useState<{ projectId: string; title: string; mp4Key: string }[] | null>(null);
  const [filmKey, setFilmKey] = useState("");
  const [brief, setBrief] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [hasFile, setHasFile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !user) return;
    const { data } = await sb
      .from("social_launches")
      .select("id,brief,status,kit,results,error_message,created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setLaunches(data as unknown as LaunchRow[]);
    // Finished films are launchable without re-uploading.
    const { data: own } = await sb.from("projects").select("id,title,status").eq("status", "READY").order("created_at", { ascending: false }).limit(20);
    if (own) {
      const ids = own.map((p) => p.id);
      const { data: f } = await sb.from("films").select("project_id,mp4_key").in("project_id", ids);
      if (f) {
        const titles = new Map(own.map((p) => [p.id, p.title]));
        setFilms(f.map((row) => ({ projectId: row.project_id, title: titles.get(row.project_id) ?? "Untitled film", mp4Key: row.mp4_key })));
      }
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [user, refresh]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    const file = fileRef.current?.files?.[0];
    if (!sb || !user || busy || (!file && !filmKey)) return;
    setBusy(true);
    setError(null);
    try {
      let key = filmKey;
      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "mp4";
        key = `launches/${user.id}/${crypto.randomUUID()}.${ext}`;
        const up = await sb.storage.from(BUCKET).upload(key, file, { upsert: true });
        if (up.error) throw new Error(up.error.message);
      }
      const ins = await sb.from("social_launches").insert({ user_id: user.id, video_key: key, brief });
      if (ins.error) throw new Error(ins.error.message);
      setBrief("");
      setFilmKey("");
      if (fileRef.current) fileRef.current.value = "";
      setHasFile(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onLaunch(id: string) {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("social_launches").update({ status: "LAUNCH_REQUESTED" }).eq("id", id);
    await refresh();
  }

  const fileCls =
    "w-full text-[11px] text-cf-muted file:mr-3 file:border file:border-cf-line file:bg-transparent file:px-3 file:py-2 file:font-mono file:text-[11px] file:uppercase file:tracking-[0.1em] file:text-cf-fg hover:file:border-cf-fg";
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="Publishing / The distribution desk"
        title={<>One film.<br /><em>Every screen.</em></>}
        copy={
          <>
            <p>Bring a finished film or any video and a one-line brief. The desk writes the launch kit for every platform — title, description, hashtags — then one action posts it to every connected account.</p>
            <p><strong>The production does not end at the final cut.</strong></p>
          </>
        }
        status={{ tone: "live", label: `${Object.keys(PLATFORM_META).length} platforms` }}
      />
      <div className="pt-12">
        <StudioGate signIn="Sign in to publish" what="Launches">
          <Section label="01 — New launch" title="Prepare the master.">
            <Split>
              <Cell>
                <form onSubmit={onCreate}>
                  {(films?.length ?? 0) > 0 && (
                    <>
                      <label htmlFor="launch-film" className="cf-label mb-2 block text-cf-fg">A finished film</label>
                      <select id="launch-film" value={filmKey} onChange={(e) => setFilmKey(e.target.value)} className="cf-input py-2.5">
                        <option value="">Choose one of your finished films…</option>
                        {films!.map((f) => (
                          <option key={f.projectId} value={f.mp4Key}>
                            {f.title}
                          </option>
                        ))}
                      </select>
                      <div className="cf-label my-5 text-center">or</div>
                    </>
                  )}
                  <label htmlFor="launch-file" className="cf-label mb-2 block text-cf-fg">Upload a video</label>
                  <input id="launch-file" ref={fileRef} type="file" accept="video/*" onChange={(e) => setHasFile((e.target.files?.length ?? 0) > 0)} className={fileCls} />
                  <label htmlFor="launch-brief" className="cf-label mb-2 mt-6 block text-cf-fg">The brief</label>
                  <textarea
                    id="launch-brief"
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    placeholder="What is this video? One or two sentences — the desk expands it into every platform's title, description and hashtags."
                    required
                    rows={3}
                    className="cf-input resize-y"
                  />
                  <button type="submit" disabled={busy || !brief.trim() || (!filmKey && !hasFile)} className="cf-btn-ink mt-7">
                    {busy ? "Uploading…" : "Build the launch kit"}
                  </button>
                  {error && <p role="alert" className="mt-4 border-l-2 border-cf-danger pl-3 text-[12px] text-cf-danger">{error}</p>}
                </form>
              </Cell>
              <Cell>
                <div className="cf-label">Destinations</div>
                <SpecList className="mt-8" rows={Object.values(PLATFORM_META).map((m) => [m.label, m.hint])} />
              </Cell>
            </Split>
          </Section>

          <Section label="02 — Launches" title="The release log.">
            {!launches ? (
              <SkeletonRows rows={3} />
            ) : launches.length === 0 ? (
              <EmptyState title={<>Nothing released <em>yet.</em></>} hint="Prepare your first master above." />
            ) : (
              <ol className="border-t border-cf-fg">
                {launches.map((l) => (
                  <LaunchCard key={l.id} row={l} onLaunch={() => onLaunch(l.id)} />
                ))}
              </ol>
            )}
          </Section>
        </StudioGate>
      </div>
    </div>
  );
}

function LaunchCard({ row, onLaunch }: { row: LaunchRow; onLaunch: () => void }) {
  const kitReady = row.status === "KIT_READY" || row.status === "LAUNCHED" || row.status === "LAUNCHING" || row.status === "LAUNCH_REQUESTED";
  const tone = row.status === "LAUNCHED" ? "ok" : row.status === "FAILED" ? "danger" : row.status === "KIT_READY" ? "live" : "warn";
  return (
    <li className="border-b border-cf-line py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate font-display font-semibold text-[22px] tracking-[-0.02em]">{row.brief || "Untitled launch"}</div>
          <div className="cf-label mt-1">{new Date(row.created_at).toLocaleString()}</div>
        </div>
        <div className="flex items-center gap-4">
          <Status tone={tone}>{row.status.replace(/_/g, " ").toLowerCase()}</Status>
          {row.status === "KIT_READY" && (
            <button type="button" onClick={onLaunch} className="cf-btn-accent">
              Launch everywhere →
            </button>
          )}
        </div>
      </div>

      {row.error_message && <p className="mt-3 border-l-2 border-cf-danger pl-3 text-[12px] text-cf-danger">{row.error_message}</p>}

      {kitReady && row.kit && (
        <div className="mt-5 grid gap-px border border-cf-line bg-cf-line sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(row.kit).map(([platform, k]) => {
            const meta = PLATFORM_META[platform] ?? { label: platform, hint: "" };
            const result = row.results?.[platform];
            return (
              <div key={platform} className="bg-cf-bg p-4">
                <div className="flex items-center justify-between">
                  <span className="cf-label text-cf-fg">{meta.label}</span>
                  {result && <Status tone={result.status === "published" ? "ok" : result.status === "skipped" ? "idle" : "danger"}>{result.status}</Status>}
                </div>
                <div className="mt-3 truncate font-display font-semibold text-[16px]" title={k.title}>
                  {k.title}
                </div>
                <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-cf-muted">{k.description}</p>
                <p className="mt-2 truncate font-mono text-[12px] text-cf-muted">{k.hashtags?.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p>
                {result?.url && (
                  <a href={result.url} target="_blank" rel="noreferrer" className="cf-link mt-3 inline-block">
                    View post ↗
                  </a>
                )}
                {result?.detail && <p className="mt-2 text-[12px] text-cf-muted">{result.detail}</p>}
                {!result && <p className="cf-label mt-3 leading-relaxed">{meta.hint}</p>}
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}
