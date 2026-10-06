"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { listProjects, type ProjectRow } from "../../lib/projects";
import { listCharacters, listLocations } from "../../lib/library";
import { getSupabase } from "../../lib/supabase";
import { fmtDuration } from "../../lib/system";
import { msToCredits } from "../../lib/plans";
import { EmptyState, PageHeader, Section, Status } from "../cf/primitives";
import { StudioGate } from "../cf/StudioGate";
import { ViewContext } from "./ViewContext";

const ACTIVE = new Set(["PLANNING", "GENERATING", "RENDERING"]);

/** Viewing as Creator (docs/design/view-creator.html) — the work closest to you, from your real rows. */
export function CreatorView() {
  const { user, profile } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [library, setLibrary] = useState<{ characters: number; worlds: number; voices: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    void listProjects(50).then(setProjects);
    void (async () => {
      const sb = getSupabase();
      const [c, l, v] = await Promise.all([
        listCharacters(),
        listLocations(),
        sb ? sb.from("voices").select("id", { count: "exact", head: true }).eq("user_id", user.id) : Promise.resolve({ count: 0 }),
      ]);
      setLibrary({ characters: c.length, worlds: l.length, voices: v.count ?? 0 });
    })();
  }, [user]);

  // What needs attention first: in production, then the latest.
  const ordered = [...(projects ?? [])].sort((a, b) => Number(ACTIVE.has(b.status)) - Number(ACTIVE.has(a.status))).slice(0, 6);
  const active = projects?.filter((p) => ACTIVE.has(p.status)).length ?? 0;
  const ready = projects?.filter((p) => p.status === "READY") ?? [];

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="Operating context / 01"
        title={<>Your<br /><em>studio.</em></>}
        copy={
          <>
            <p>Creator mode puts the production system around the individual maker — your productions, your worlds, your characters, your work in progress.</p>
            <p><strong>Nothing unnecessary between you and the work.</strong></p>
          </>
        }
        status={{ tone: "live", label: "Current context · Creator" }}
      />
      <ViewContext slug="creator" />
      <StudioGate signIn="Sign in to see your work" what="Your productions">
        <Section label="My work" title="The work closest to you.">
          <div className="grid gap-px border border-cf-line bg-cf-line lg:grid-cols-[1.35fr_0.65fr]">
            <div className="bg-cf-bg p-6 sm:p-8">
              <div className="cf-label">Current productions</div>
              {!projects ? (
                <p className="cf-label mt-6">Loading…</p>
              ) : ordered.length === 0 ? (
                <EmptyState className="mt-6" title={<>Nothing in <em>production.</em></>} action={{ label: "Enter the studio", href: "/create" }} />
              ) : (
                <ol className="mt-6 border-t border-cf-line">
                  {ordered.map((p) => (
                    <li key={p.id} className="border-b border-cf-line">
                      <Link href={`/projects/${p.id}`} className="grid grid-cols-[1fr_auto] items-center gap-4 py-4 hover:bg-cf-soft/60">
                        <span className="truncate font-serif text-[20px]">{p.title}</span>
                        <Status tone={ACTIVE.has(p.status) ? "live" : p.status === "READY" ? "ok" : p.status === "FAILED" ? "danger" : "idle"}>{p.status.toLowerCase()}</Status>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="bg-cf-bg p-6 sm:p-8">
              <div className="cf-label">Creative library</div>
              <ol className="mt-6 border-t border-cf-line">
                {[
                  ["Characters", library?.characters, "/library/characters"],
                  ["Worlds", library?.worlds, "/library/worlds"],
                  ["Voices", library?.voices, "/library/voices"],
                ].map(([k, v, href]) => (
                  <li key={k as string} className="border-b border-cf-line">
                    <Link href={href as string} className="flex items-baseline justify-between py-4 hover:bg-cf-soft/60">
                      <span className="font-serif text-[20px]">{k}</span>
                      <span className="cf-display text-[32px] leading-none">{v ?? "—"}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Section>

        <Section label="Practice" title="Your production at a glance.">
          <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Active productions", String(active), "currently moving"],
              ["Finished", String(ready.length), "ready to screen"],
              ["Runtime finished", fmtDuration(ready.reduce((t, p) => t + p.target_seconds, 0)), "across finished work"],
              ["Credits", profile ? msToCredits(profile.creditsMs).toLocaleString() : "—", profile ? `${profile.tier} plan` : ""],
            ].map(([k, v, sub]) => (
              <div key={k} className="bg-cf-bg p-6">
                <div className="cf-label">{k}</div>
                <div className="cf-display mt-7 text-[44px] leading-none">{v}</div>
                <div className="mt-2 text-[11px] text-cf-muted">{sub}</div>
              </div>
            ))}
          </div>
        </Section>
      </StudioGate>
    </div>
  );
}
