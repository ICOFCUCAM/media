"use client";

import Link from "next/link";
import { SUBSYSTEMS } from "../../../lib/system";
import { useRole } from "../../../components/RoleContext";

const REPO = "https://github.com/ICOFCUCAM/media/blob/main";

const LIFECYCLE = [
  "POST /generate-film → cost gate + GPU start-on-demand",
  "Director plans screenplay, bibles, scenes, shots",
  "BullMQ flow: render ← scene ← shots + music",
  "GPU pool generates shots (cache hits cost 0)",
  "Budget governor meters spend; pauses if over ceiling",
  "FFmpeg: normalize → concat → ducked mix → HLS",
  "film.ready over Realtime → stream + download",
  "Queue drains → GPU auto-shutdown after grace",
];

export default function AdminPage() {
  const { role, setRole } = useRole();

  if (role !== "admin") {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-widest text-white/50">
          Restricted
        </div>
        <h1 className="text-xl font-semibold">System Administration</h1>
        <p className="mt-2 text-sm text-white/55">
          GPU pools, queues, model routing and render infrastructure are only visible to platform
          operators. Creators never need to see them.
        </p>
        <button
          onClick={() => setRole("admin")}
          className="mt-5 rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/5"
        >
          Switch to Super Admin
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">System Administration</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/55">
          The engines that power every creator action — kept out of the studio. Each subsystem links
          to its design doc. Implemented subsystems ship with code and tests.
        </p>
      </header>

      <section id="compute" className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SUBSYSTEMS.map((s) => (
          <a
            key={s.name}
            href={`${REPO}/${s.doc}`}
            className="rounded-xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-white/20"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{s.name}</h3>
              <Status status={s.status} />
            </div>
            <p className="mt-2 text-sm text-white/55">{s.blurb}</p>
            <p className="mt-2 font-mono text-[11px] text-white/30">{s.doc}</p>
          </a>
        ))}
      </section>

      <section id="models" className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-lg font-semibold">Request → film lifecycle</h2>
        <ol className="mt-4 grid gap-2 text-sm text-white/60 sm:grid-cols-2">
          {LIFECYCLE.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-white/30">{String(i + 1).padStart(2, "0")}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-6 text-xs text-white/40">
        Data, auth, realtime and storage run on Supabase (see{" "}
        <Link href="/" className="underline">docs/25-supabase.md</Link>); GPU inference and FFmpeg run on
        separate worker services.
      </p>
    </div>
  );
}

function Status({ status }: { status: string }) {
  const cls =
    status === "Implemented"
      ? "border-emerald-400/40 text-emerald-300"
      : status === "Stubbed"
        ? "border-sky-400/40 text-sky-300"
        : "border-white/20 text-white/50";
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${cls}`}>{status}</span>;
}
