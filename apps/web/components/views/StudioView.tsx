"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { listProjects, type ProjectRow } from "../../lib/projects";
import { getSupabase } from "../../lib/supabase";
import { fmtDuration } from "../../lib/system";
import { EmptyState, PageHeader, Section, Status } from "../cf/primitives";
import { StudioGate } from "../cf/StudioGate";
import { ViewContext } from "./ViewContext";

const ACTIVE = new Set(["PLANNING", "GENERATING", "RENDERING"]);
const STAGE: Record<string, string> = {
  DRAFT: "Draft",
  PLANNING: "Story",
  GENERATING: "Production",
  RENDERING: "Finishing",
  READY: "Delivered",
  PAUSED: "Paused",
  FAILED: "Stopped",
};

/** Viewing as Studio (docs/design/view-studio.html) — the house's single view of the work. */
export function StudioView() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [house, setHouse] = useState<{ seats: number; launches: number; views: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    void listProjects(50).then(setProjects);
    const sb = getSupabase();
    if (!sb) return;
    void (async () => {
      const [team, launches, films] = await Promise.all([
        sb.from("team_invites").select("id", { count: "exact", head: true }).neq("status", "REVOKED"),
        sb.from("social_launches").select("id", { count: "exact", head: true }).eq("status", "LAUNCHED"),
        sb.from("films").select("views").limit(200),
      ]);
      setHouse({
        seats: (team.count ?? 0) + 1,
        launches: launches.count ?? 0,
        views: (films.data ?? []).reduce((t, f) => t + (f.views ?? 0), 0),
      });
    })();
  }, [user]);

  const moving = projects?.filter((p) => ACTIVE.has(p.status)).length ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="Operating context / 02"
        title={<>Run the<br /><em>house.</em></>}
        copy={
          <>
            <p>Studio mode gives the production house a single view of the work — productions, people and delivery moving together.</p>
            <p><strong>The studio sees the whole picture.</strong></p>
          </>
        }
        status={{ tone: "live", label: "Current context · Studio" }}
      />
      <ViewContext slug="studio" />
      <StudioGate signIn="Sign in to run the house" what="Studio views">
        <Section label="The house" title="Position.">
          <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["In production", String(moving), "/projects"],
              ["People", house ? String(house.seats) : "—", "/enterprise/teams"],
              ["Launched", house ? String(house.launches) : "—", "/publish"],
              ["Views", house ? house.views.toLocaleString() : "—", "/analytics/audience"],
            ].map(([k, v, href]) => (
              <Link key={k} href={href} className="bg-cf-bg p-6 transition hover:bg-cf-soft">
                <div className="cf-label">{k}</div>
                <div className="cf-display mt-7 text-[44px] leading-none">{v}</div>
              </Link>
            ))}
          </div>
        </Section>

        <Section label="Productions" title="Everything currently moving.">
          {!projects ? (
            <p className="cf-label">Loading productions…</p>
          ) : projects.length === 0 ? (
            <EmptyState title={<>The house is <em>quiet.</em></>} action={{ label: "Start a production", href: "/create" }} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-t border-cf-fg text-left">
                <caption className="sr-only">Productions in the house</caption>
                <thead>
                  <tr className="border-b border-cf-line">
                    {["#", "Production", "Runtime", "Progress", "Stage", "Status"].map((h) => (
                      <th key={h} scope="col" className="cf-label py-4 pr-4 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p, i) => (
                    <tr key={p.id} className="border-b border-cf-line">
                      <td className="py-4 pr-4 font-mono text-[9px] text-cf-muted">{String(i + 1).padStart(3, "0")}</td>
                      <th scope="row" className="py-4 pr-4 font-normal">
                        <Link href={`/projects/${p.id}`} className="font-serif text-[18px] hover:underline hover:decoration-cf-line hover:underline-offset-4">
                          {p.title}
                        </Link>
                      </th>
                      <td className="py-4 pr-4 font-mono text-[10px]">{fmtDuration(p.target_seconds)}</td>
                      <td className="py-4 pr-4">
                        <span className="block h-[2px] w-24 bg-cf-line">
                          <span className="block h-full bg-cf-fg" style={{ width: `${Math.round(p.progress * 100)}%` }} />
                        </span>
                      </td>
                      <td className="cf-label py-4 pr-4">{STAGE[p.status] ?? p.status}</td>
                      <td className="py-4">
                        <Status tone={ACTIVE.has(p.status) ? "live" : p.status === "READY" ? "ok" : p.status === "FAILED" ? "danger" : "idle"}>
                          {ACTIVE.has(p.status) ? "Active" : p.status === "READY" ? "Ready" : p.status.toLowerCase()}
                        </Status>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </StudioGate>
    </div>
  );
}
