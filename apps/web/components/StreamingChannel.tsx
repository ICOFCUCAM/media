"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { StudioGate } from "./cf/StudioGate";
import { EmptyState, PageHeader, Section, Status } from "./cf/primitives";
import { fmtDuration } from "../lib/system";
import { getSupabase } from "../lib/supabase";
import { signedUrl } from "../lib/storyboard";
import { HlsPlayer } from "./HlsPlayer";
import { SkeletonCards } from "./Skeleton";
import { featureFilm } from "../lib/showcase";

/** The Screening Room (docs/design/screening-room.html). Streaming — your channel: every finished film with adaptive playback
 *  (HLS ladder when rendered, MP4 fallback) and per-title stats. */
export function StreamingChannel() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === "ADMIN";
  const [notice, setNotice] = useState<string | null>(null);
  const [titles, setTitles] = useState<
    { projectId: string; title: string; duration: number; views: number; mp4Key: string; url: string | null; locales: string[] }[] | null
  >(null);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !user) return;
    void (async () => {
      const { data: projects } = await sb.from("projects").select("id,title,status").eq("status", "READY").order("created_at", { ascending: false }).limit(24);
      const ids = (projects ?? []).map((p) => p.id);
      if (!ids.length) return setTitles([]);
      const { data: films } = await sb.from("films").select("project_id,mp4_key,hls_key,duration_sec,views,locales").in("project_id", ids);
      const titleOf = new Map((projects ?? []).map((p) => [p.id, p.title]));
      const rows = await Promise.all(
        (films ?? []).map(async (f) => ({
          projectId: f.project_id,
          title: titleOf.get(f.project_id) ?? "Untitled",
          duration: f.duration_sec,
          views: f.views ?? 0,
          mp4Key: f.mp4_key,
          url: (f.mp4_key ? await signedUrl(f.mp4_key) : null) ?? null,
          locales: Object.keys((f.locales as Record<string, unknown> | null) ?? {}),
        })),
      );
      setTitles(rows.filter((r) => r.url));
    })();
  }, [user]);

  const current = titles?.find((t) => t.projectId === active) ?? titles?.[0];

  async function onDelete(projectId: string, title: string) {
    if (!window.confirm(`Delete "${title}"? The project and its film are removed from your channel.`)) return;
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("projects").delete().eq("id", projectId);
    setTitles((prev) => prev?.filter((t) => t.projectId !== projectId) ?? prev);
    if (active === projectId) setActive(null);
  }

  async function onFeature(t: { projectId: string; title: string; mp4Key: string }) {
    setNotice(null);
    try {
      await featureFilm(t.projectId, t.mp4Key, t.title);
      setNotice(`“${t.title}” is now featured on the homepage.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Feature failed");
    }
  }

  const totalViews = titles?.reduce((t, x) => t + x.views, 0) ?? 0;
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        art={false}
        eyebrow="Publishing / Screening"
        title={<>The<br /><em>Screening</em><br />Room.</>}
        copy={
          <>
            <p>Finished work deserves a place of its own. Every completed production screens here with adaptive playback and its own numbers.</p>
            <p><strong>Your private channel today — public channel pages are not built yet.</strong></p>
          </>
        }
        status={titles ? { tone: titles.length ? "live" : "idle", label: `${titles.length} titles · ${totalViews.toLocaleString("en-US")} views` } : { tone: "idle", label: "Screening room" }}
      />
      <div className="pt-12">
        <StudioGate signIn="Sign in to open your channel" what="Screenings">
          {!titles ? (
            <SkeletonCards cards={2} />
          ) : titles.length === 0 ? (
            <EmptyState
              title={<>Nothing to <em>screen yet.</em></>}
              hint="Your channel fills itself as productions complete."
              action={{ label: "Enter the studio", href: "/create" }}
            />
          ) : (
            <>
              <section aria-label="Featured screening">
                <div className="mb-5 flex items-end justify-between gap-4">
                  <div>
                    <div className="cf-label">Featured screening</div>
                    <div className="mt-2 font-display font-semibold text-[28px] leading-none tracking-[-0.03em]">{current?.title}</div>
                  </div>
                  <span className="cf-label">Master / {fmtDuration(Math.round(current?.duration ?? 0))}</span>
                </div>
                <div className="cf-dark grid gap-px bg-cf-line lg:grid-cols-[1.4fr_0.6fr]">
                  <div className="flex items-center bg-black">{current?.url && <HlsPlayer key={current.projectId} src={current.url} />}</div>
                  <div className="flex flex-col bg-cf-bg p-6 sm:p-8">
                    <div className="cf-label">Cineforge premiere</div>
                    <h2 className="cf-display mt-4 text-[clamp(32px,3.6vw,52px)] leading-[0.95]">{current?.title}</h2>
                    <dl className="mt-8 grid grid-cols-3 border-b border-t border-cf-line">
                      {[
                        ["Runtime", fmtDuration(Math.round(current?.duration ?? 0))],
                        ["Views", (current?.views ?? 0).toLocaleString("en-US")],
                        ["Dubbed", current?.locales.length ? current.locales.map((l) => l.toUpperCase()).join(" ") : "—"],
                      ].map(([k, v], i) => (
                        <div key={k} className={`py-4 ${i ? "border-l border-cf-line pl-4" : ""}`}>
                          <dt className="cf-label">{k}</dt>
                          <dd className="mt-2 truncate text-[12px]">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-auto flex flex-wrap gap-2 pt-8">
                      {isAdmin && current && (
                        <button type="button" onClick={() => void onFeature(current)} className="cf-btn-accent">
                          Feature on homepage
                        </button>
                      )}
                      {current && (
                        <button type="button" onClick={() => void onDelete(current.projectId, current.title)} className="cf-btn border border-cf-line text-cf-muted hover:border-cf-danger hover:text-cf-danger">
                          Delete
                        </button>
                      )}
                    </div>
                    {notice && <p role="status" className="mt-4 text-[12px] text-cf-accent">{notice}</p>}
                  </div>
                </div>
              </section>

              <Section label="Viewing destinations" title={<>One production.<br />Many rooms.</>}>
                <ol className="border-t border-cf-fg">
                  {titles.map((t, i) => {
                    const on = current?.projectId === t.projectId;
                    return (
                      <li key={t.projectId} className="border-b border-cf-line">
                        <button
                          type="button"
                          onClick={() => setActive(t.projectId)}
                          aria-pressed={on}
                          className={`grid w-full grid-cols-[44px_1fr_auto] items-center gap-4 px-2 py-5 text-left transition ${on ? "bg-cf-soft" : "hover:bg-cf-soft/60"}`}
                        >
                          <span className="font-mono text-[11px] text-cf-muted">{String(i + 1).padStart(2, "0")}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-display font-semibold text-[19px]">{t.title}</span>
                            <span className="cf-label mt-1 block">
                              {fmtDuration(Math.round(t.duration))}
                              {t.locales.length ? ` · ${t.locales.length + 1} languages` : ""}
                            </span>
                          </span>
                          <Status tone={on ? "live" : "idle"}>{t.views.toLocaleString("en-US")} views</Status>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </Section>

              <Section label="Screening control" title="Presentation, not distribution.">
                <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Playback master", "MP4", "Signed, short-lived link per screening."],
                    ["Captions & dubs", `${titles.filter((t) => t.locales.length).length} dubbed`, "Language tracks from the multilingual pipeline."],
                    ["Audience access", "Private", "Only you, signed in. Public pages are not built yet."],
                    ["Analytics", `${totalViews.toLocaleString("en-US")} views`, "Plays counted per title, read by Audience."],
                  ].map(([k, v, note]) => (
                    <div key={k} className="min-h-[160px] bg-cf-bg p-5">
                      <div className="cf-label">{k}</div>
                      <div className="mt-8 font-display font-semibold text-[22px] tracking-[-0.03em]">{v}</div>
                      <p className="mt-1.5 text-[11px] text-cf-muted">{note}</p>
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}
        </StudioGate>
      </div>
    </div>
  );
}
