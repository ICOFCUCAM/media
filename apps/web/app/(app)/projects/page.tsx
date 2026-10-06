"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../components/AuthProvider";
import { AuthCard } from "../../../components/AuthCard";
import { listProjects, type ProjectRow } from "../../../lib/projects";
import { getSupabase } from "../../../lib/supabase";
import { fmtDuration } from "../../../lib/system";
import { EmptyState, PageHeader, Section, SpecList, Status } from "../../../components/cf/primitives";

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

  useEffect(() => {
    if (!user) return;
    void listProjects(50).then(setProjects);

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
          {lead && <Lead project={lead} />}

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
                className="cf-input w-[240px] py-2.5 font-mono text-[10px] uppercase tracking-[0.1em]"
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
              <ol className="border-t border-cf-fg">
                {shown.map((p, i) => (
                  <li key={p.id} className="group grid grid-cols-[36px_1fr_auto] items-center gap-4 border-b border-cf-line py-4 md:grid-cols-[36px_1.6fr_0.6fr_0.6fr_1fr_0.6fr_40px]">
                    <span className="font-mono text-[9px] text-cf-muted">{String(i + 1).padStart(2, "0")}</span>
                    <Link href={`/projects/${p.id}`} className="min-w-0">
                      <span className="block truncate font-serif text-[20px] tracking-[-0.02em] group-hover:underline group-hover:decoration-cf-line group-hover:underline-offset-4">
                        {p.title}
                      </span>
                      <span className="cf-label mt-1 block md:hidden">
                        {MODE_LABEL[p.mode] ?? p.mode} · {fmtDuration(p.target_seconds)} · {STAGE_LABEL[p.status] ?? p.status}
                      </span>
                    </Link>
                    <span className="cf-label hidden md:block">{MODE_LABEL[p.mode] ?? p.mode}</span>
                    <span className="hidden font-mono text-[10px] md:block">{fmtDuration(p.target_seconds)}</span>
                    <span className="hidden md:block">
                      <StateLine project={p} />
                    </span>
                    <span className="cf-label hidden md:block">{new Date(p.created_at).toLocaleDateString()}</span>
                    <span className="text-right">
                      {!ACTIVE.has(p.status) && (
                        <button
                          type="button"
                          onClick={() => void onDelete(p.id, p.title)}
                          aria-label={`Delete ${p.title}`}
                          title="Delete project"
                          className="h-8 w-8 border border-transparent text-cf-dim transition hover:border-cf-danger hover:text-cf-danger"
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
function Lead({ project: p }: { project: ProjectRow }) {
  return (
    <section className="border-b border-cf-line py-12" aria-label="Lead production">
      <div className="cf-label mb-5">{ACTIVE.has(p.status) ? "Active production" : "Most recent"}</div>
      <div className="cf-dark grid lg:grid-cols-[1.35fr_0.65fr]">
        <div className="relative flex min-h-[320px] flex-col justify-end overflow-hidden p-8">
          <div className="pointer-events-none absolute inset-[12%] border border-cf-line" aria-hidden />
          <span className="cf-label relative">CF / {p.id.slice(0, 4).toUpperCase()}</span>
          <h2 className="cf-display relative mt-3 text-[clamp(36px,4.5vw,64px)] leading-[0.95]">{p.title}</h2>
          {p.prompt && p.prompt !== p.title && <p className="relative mt-4 line-clamp-2 max-w-xl text-[13px] leading-relaxed text-cf-muted">{p.prompt}</p>}
        </div>
        <div className="border-t border-cf-line p-8 lg:border-l lg:border-t-0">
          <SpecList
            rows={[
              ["Production", STAGE_LABEL[p.status] ?? p.status],
              ["Progress", `${Math.round(p.progress * 100)}%`],
              ["Runtime", fmtDuration(p.target_seconds)],
              ["Format", p.resolution],
              ["Mode", MODE_LABEL[p.mode] ?? p.mode],
            ]}
          />
          <Link href={`/projects/${p.id}`} className="cf-btn-accent mt-8 w-full">
            Open production →
          </Link>
        </div>
      </div>
    </section>
  );
}
