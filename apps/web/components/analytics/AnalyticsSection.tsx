"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { AuthCard } from "../AuthCard";
import { getSupabase } from "../../lib/supabase";
import { msToCredits } from "../../lib/plans";
import { StatCard, BarChart, RankList, Panel, type Bar } from "./Charts";

/**
 * Analytics on REAL rows — usage_records (generation spend), projects/films
 * (output), social_launches (distribution), voices/voiceovers (voice lab).
 * Three sections share one loader; each renders its own cut of the data.
 */

interface Data {
  films: { id: string; title: string; status: string; created_at: string }[];
  filmRows: { project_id: string; views: number; duration_sec: number }[];
  usage: { gpu_ms: number; kind: string; created_at: string }[];
  launches: { status: string; results: Record<string, { status: string }> | null }[];
  voices: number;
  voiceovers: number;
  creditsMs: number;
}

function useAnalytics(): { data: Data | null; user: unknown; enabled: boolean; loading: boolean } {
  const { enabled, loading, user, profile } = useAuth();
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !user) return;
    void (async () => {
      const [projects, films, usage, launches, voices, voiceovers] = await Promise.all([
        sb.from("projects").select("id,title,status,created_at").order("created_at", { ascending: false }).limit(100),
        sb.from("films").select("project_id,views,duration_sec").limit(100),
        sb.from("usage_records").select("gpu_ms,kind,created_at").order("created_at", { ascending: false }).limit(500),
        sb.from("social_launches").select("status,results").limit(50),
        sb.from("voices").select("id", { count: "exact", head: true }),
        sb.from("voiceovers").select("id", { count: "exact", head: true }),
      ]);
      setData({
        films: (projects.data ?? []) as Data["films"],
        filmRows: (films.data ?? []) as Data["filmRows"],
        usage: (usage.data ?? []) as Data["usage"],
        launches: (launches.data ?? []) as unknown as Data["launches"],
        voices: voices.count ?? 0,
        voiceovers: voiceovers.count ?? 0,
        creditsMs: profile?.creditsMs ?? 0,
      });
    })();
  }, [user, profile]);

  return { data, user, enabled, loading };
}

function dailyBars(usage: Data["usage"], days = 14): Bar[] {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const u of usage) {
    const k = u.created_at.slice(0, 10);
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + u.gpu_ms);
  }
  return [...buckets.entries()].map(([k, v]) => ({ label: k.slice(5), value: Math.round(v / 60000) }));
}

export function AnalyticsSection({ section }: { section: "revenue" | "audience" | "performance" }) {
  const { data, user, enabled, loading } = useAnalytics();

  const titles: Record<string, { title: string; subtitle: string }> = {
    revenue: { title: "Revenue & Spend", subtitle: "What you generate, what it costs, what's left." },
    audience: { title: "Audience", subtitle: "Views and distribution across your published work." },
    performance: { title: "Performance", subtitle: "Production throughput and pipeline health." },
  };
  const t = titles[section]!;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="mt-1 text-sm text-white/55">{t.subtitle}</p>
      </header>

      {!enabled ? (
        <p className="text-sm text-white/45">Connect Supabase to see analytics.</p>
      ) : loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : !user ? (
        <AuthCard title="Sign in to see analytics" />
      ) : !data ? (
        <p className="text-sm text-white/40">Crunching…</p>
      ) : (
        <SectionBody section={section} data={data} />
      )}
    </div>
  );
}

function SectionBody({ section, data }: { section: string; data: Data }) {
  const totalMs = data.usage.reduce((a, u) => a + u.gpu_ms, 0);
  const ready = data.films.filter((f) => f.status === "READY");
  const totalViews = data.filmRows.reduce((a, f) => a + (f.views ?? 0), 0);
  const published = data.launches.filter((l) => l.status === "LAUNCHED").length;

  if (section === "revenue") {
    const byKind = Object.entries(
      data.usage.reduce<Record<string, number>>((acc, u) => {
        acc[u.kind] = (acc[u.kind] ?? 0) + u.gpu_ms;
        return acc;
      }, {}),
    ).map(([label, v]) => ({ label, value: Math.round(v / 60000) }));
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Credits remaining" value={msToCredits(data.creditsMs).toLocaleString()} sub="tops up on /pricing" />
          <StatCard label="Generation used" value={`${Math.round(totalMs / 60000)} min`} sub="across all engines" />
          <StatCard label="Marketplace earnings" value="$0" sub="voice sales appear here" />
        </div>
        <Panel title="Generation minutes — last 14 days">
          <BarChart bars={dailyBars(data.usage)} unit="min" />
        </Panel>
        <Panel title="Spend by kind (minutes)">
          <RankList rows={byKind} unit="min" />
        </Panel>
      </div>
    );
  }

  if (section === "audience") {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Total views" value={totalViews.toLocaleString()} sub="across published films" />
          <StatCard label="Published films" value={String(ready.length)} />
          <StatCard label="Social launches" value={String(published)} sub="via the Launchpad" />
        </div>
        <Panel title="Most viewed">
          <RankList
            rows={data.filmRows
              .map((f) => ({
                label: data.films.find((p) => p.id === f.project_id)?.title ?? "Untitled",
                value: f.views ?? 0,
              }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 8)}
            unit="views"
          />
        </Panel>
      </div>
    );
  }

  // performance
  const failed = data.films.filter((f) => f.status === "FAILED").length;
  const successRate = data.films.length ? Math.round((ready.length / data.films.length) * 100) : 100;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Projects" value={String(data.films.length)} />
        <StatCard label="Completed" value={String(ready.length)} sub={`${successRate}% completion`} />
        <StatCard label="Failed" value={String(failed)} />
        <StatCard label="Voice assets" value={`${data.voices} voices · ${data.voiceovers} readings`} />
      </div>
      <Panel title="Production activity — last 14 days (generation minutes)">
        <BarChart bars={dailyBars(data.usage)} unit="min" />
      </Panel>
    </div>
  );
}
