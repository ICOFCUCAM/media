"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import { AuthCard } from "../../../components/AuthCard";
import { listProjects, posterUrls, type ProjectRow } from "../../../lib/projects";
import { getSupabase } from "../../../lib/supabase";
import { fmtDuration } from "../../../lib/system";
import { when } from "../../../lib/when";
import { EmptyState, PageHeader, Section, SpecList, Status } from "../../../components/cf/primitives";
import { CinemaArt } from "../../../components/cf/CinemaArt";

const STAGE_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PLANNING: "Queued",
  GENERATING: "Filming",
  RENDERING: "Editing",
  READY: "Ready",
  PAUSED: "Paused",
  FAILED: "Failed",
};

const ACTIVE = new Set(["PLANNING", "GENERATING", "RENDERING"]);

export default function ProjectsPage() {
  const { enabled, loading, user } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [posters, setPosters] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    void listProjects(50).then((rows) => {
      setProjects(rows);
      // Finished films carry a real poster frame; the rest keep a drawn one.
      const done = rows.filter((r) => r.status === "READY").map((r) => r.id);
      void posterUrls(done).then(setPosters);
    });

    // Live board: any status/progress change to the user's projects updates the
    // row in place (RLS scopes the stream to the signed-in owner).
    const sb = getSupabase();
    if (!sb) return;
    const channel = sb
      .channel("projects:board")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "projects" }, (payload) => {
        const row = payload.new as ProjectRow;
        setProjects((prev) => prev?.map((p) => (p.id === row.id ? row : p)) ?? prev);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "projects" }, (payload) => {
        const row = payload.new as ProjectRow;
        setProjects((prev) => (prev && !prev.some((p) => p.id === row.id) ? [row, ...prev] : prev));
      })
      .subscribe();
    return () => void channel.unsubscribe();
  }, [user]);

  async function onDelete(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? The project and its scenes are removed (clips stay in storage).`)) return;
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("projects").delete().eq("id", id);
    setProjects((prev) => prev?.filter((p) => p.id !== id) ?? prev);
  }

  const active = projects?.filter((p) => ACTIVE.has(p.status)).length ?? 0;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const shown = (projects ?? []).filter(
    (p) => FILTERS[filter].test(p) && (!query.trim() || p.title.toLowerCase().includes(query.trim().toLowerCase())),
  );
  // Lead with what is in production now, else the most recent production.
  const lead = projects?.find((p) => ACTIVE.has(p.status)) ?? projects?.[0];

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        art={false}
        eyebrow="Production system / Archive"
        title={<>The<br /><em>Archive.</em></>}
        copy={
          <>
            <p>Every production has a history.</p>
            <p>Projects is the permanent record of the films, series, trailers and shorts made inside Cineforge — and the way back into each one.</p>
          </>
        }
        status={
          active > 0
            ? { tone: "live", label: `${active} in production now` }
            : { tone: "idle", label: projects ? `${projects.length} productions` : "Archive" }
        }
        aside={
          <Link href="/create" className="cf-btn-ink mt-7">
            New production
          </Link>
        }
      />

      {!enabled ? (
        <EmptyState className="mt-12" title={<>The archive needs <em>a studio.</em></>} hint="Connect Supabase (NEXT_PUBLIC_SUPABASE_URL) to persist productions." />
      ) : loading ? (
        <p className="cf-label mt-12">Opening the archive…</p>
      ) : !user ? (
        <div className="py-14">
          <AuthCard title="Sign in to see your projects" />
        </div>
      ) : !projects ? (
        <p className="cf-label mt-12">Loading productions…</p>
      ) : projects.length === 0 ? (
        <EmptyState className="mt-12" title={<>No productions <em>yet.</em></>} hint="Start in the Studio — your films and series collect here." action={{ label: "Enter the studio", href: "/create" }} />
      ) : (
        <>
          {lead && <Lead project={lead} poster={posters[lead.id]} />}

          <Section
            label="All productions"
            title={`${String(shown.length).padStart(2, "0")} productions`}
            aside={
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search archive"
                aria-label="Search the archive"
                className="cf-input w-[240px] py-2.5 font-sans text-[12px] font-medium uppercase tracking-[0.06em]"
              />
            }
          >
            <div className="mb-6 flex flex-wrap gap-1.5" role="group" aria-label="Filter productions">
              {(Object.keys(FILTERS) as Filter[]).map((f) => (
                <button key={f} type="button" className="cf-option" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {FILTERS[f].label}
                </button>
              ))}
            </div>

            {shown.length === 0 ? (
              <EmptyState title="Nothing matches." hint="Try another filter or search." />
            ) : (
              <ol className="border-t border-cf-line">
                {shown.map((p) => (
                  <li
                    key={p.id}
                    className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 border-b border-cf-line py-4 sm:grid-cols-[136px_minmax(0,1fr)_auto] lg:grid-cols-[136px_minmax(0,1fr)_170px_110px_40px]"
                  >
                    <Link href={`/projects/${p.id}`} className="hidden overflow-hidden rounded-md sm:block" tabIndex={-1} aria-hidden>
                      <Poster src={posters[p.id]} seed={p.title} className="aspect-video w-full transition duration-500 group-hover:scale-[1.04]" />
                    </Link>
                    <Link href={`/projects/${p.id}`} className="min-w-0">
                      <span className="block truncate font-display text-[19px] font-semibold tracking-[-0.02em] group-hover:text-cf-accent">{p.title}</span>
                      <span className="mt-1 block text-[13px] text-cf-muted">
                        {MODE_LABEL[p.mode] ?? p.mode} · {fmtDuration(p.target_seconds)} · {p.resolution}
                        <span className="lg:hidden"> · {when(p.created_at)}</span>
                      </span>
                    </Link>
                    <span className="col-start-2 sm:col-start-auto lg:col-start-auto">
                      <StateLine project={p} />
                    </span>
                    <span className="hidden text-[13px] text-cf-muted lg:block" title={new Date(p.created_at).toLocaleString()}>
                      {when(p.created_at)}
                    </span>
                    <span className="hidden text-right lg:block">
                      {!ACTIVE.has(p.status) && (
                        <button
                          type="button"
                          onClick={() => void onDelete(p.id, p.title)}
                          aria-label={`Delete ${p.title}`}
                          title="Delete project"
                          className="h-9 w-9 rounded-md text-cf-dim opacity-0 transition hover:bg-cf-soft hover:text-cf-danger focus:opacity-100 group-hover:opacity-100"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

type Filter = "all" | "active" | "ready" | "storyboard" | "auto" | "stopped";
const FILTERS: Record<Filter, { label: string; test: (p: ProjectRow) => boolean }> = {
  all: { label: "All", test: () => true },
  active: { label: "In production", test: (p) => ACTIVE.has(p.status) },
  ready: { label: "Ready", test: (p) => p.status === "READY" },
  auto: { label: "Auto", test: (p) => p.mode === "auto" },
  storyboard: { label: "Scene-by-scene", test: (p) => p.mode === "storyboard" },
  stopped: { label: "Drafts & stopped", test: (p) => p.status === "DRAFT" || p.status === "PAUSED" || p.status === "FAILED" },
};

const MODE_LABEL: Record<string, string> = { auto: "Auto", storyboard: "Scene-by-scene" };

/** Status + real progress from the projects row. */
function StateLine({ project: p }: { project: ProjectRow }) {
  const tone = p.status === "READY" ? "ok" : p.status === "FAILED" ? "danger" : ACTIVE.has(p.status) ? "live" : "idle";
  return (
    <span className="block">
      <Status tone={tone}>{STAGE_LABEL[p.status] ?? p.status}</Status>
      {ACTIVE.has(p.status) && (
        <span className="mt-2 block h-[2px] w-full max-w-[140px] bg-cf-line">
          <span className="block h-full bg-cf-fg transition-all" style={{ width: `${Math.round(p.progress * 100)}%` }} />
        </span>
      )}
    </span>
  );
}

/** The lead production — what is being made now, or the latest work. */
function Lead({ project: p, poster }: { project: ProjectRow; poster?: string }) {
  const live = ACTIVE.has(p.status);
  return (
    <section className="border-b border-cf-line py-12" aria-label="Lead production">
      <div className="cf-label mb-5">{live ? "In production now" : "Most recent"}</div>
      <div className="cf-dark grid overflow-hidden rounded-xl border border-cf-line lg:grid-cols-[1.4fr_0.6fr]">
        <Link href={`/projects/${p.id}`} className="group relative block min-h-[340px] overflow-hidden">
          <Poster src={poster} seed={p.title} motion className="absolute inset-0 h-full w-full transition duration-700 group-hover:scale-[1.03]" />
          <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" aria-hidden />
          <span className="absolute inset-x-0 bottom-0 p-8">
            {live && (
              <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 text-[12px] font-medium text-white backdrop-blur">
                <i className="h-1.5 w-1.5 rounded-full bg-cf-accent" />
                {STAGE_LABEL[p.status] ?? p.status} · {Math.round(p.progress * 100)}%
              </span>
            )}
            <h2 className="cf-display text-[clamp(32px,4vw,58px)] leading-[0.98] text-white [text-wrap:balance]">{p.title}</h2>
            {live && (
              <span className="mt-5 block h-[3px] max-w-md overflow-hidden rounded-full bg-white/20">
                <span className="block h-full bg-cf-accent transition-all" style={{ width: `${Math.round(p.progress * 100)}%` }} />
              </span>
            )}
          </span>
        </Link>
        <div className="flex flex-col border-t border-cf-line p-7 lg:border-l lg:border-t-0">
          <SpecList
            rows={[
              ["Status", STAGE_LABEL[p.status] ?? p.status],
              ["Runtime", fmtDuration(p.target_seconds)],
              ["Format", p.resolution],
              ["Mode", MODE_LABEL[p.mode] ?? p.mode],
              ["Started", when(p.created_at)],
            ]}
          />
          <Link href={`/projects/${p.id}`} className="cf-btn-accent mt-7 w-full lg:mt-auto">
            Open production →
          </Link>
        </div>
      </div>
    </section>
  );
}

/** A finished film's real poster, or a drawn frame — also when the poster fails to load. */
function Poster({ src, seed, className = "", motion }: { src?: string; seed: string; className?: string; motion?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed)
    return (
      /* Plain <img>: a short-lived signed storage URL. */
      <img src={src} alt="" onError={() => setFailed(true)} className={`object-cover ${className}`} />
    );
  return <CinemaArt seed={seed} motion={motion} className={className} />;
}
