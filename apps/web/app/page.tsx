import Link from "next/link";
import { SUBSYSTEMS } from "../lib/system";

export default function Home() {
  const implemented = SUBSYSTEMS.filter((s) => s.status === "Implemented").length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <section className="text-center">
        <p className="mb-4 inline-block rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-widest text-white/60">
          AI Film Generation Platform
        </p>
        <h1 className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-5xl font-semibold leading-tight text-transparent sm:text-6xl">
          Cineforge
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">
          Type a prompt. Watch the Director plan scenes, the GPU pool spin up,
          shots generate and cache, then FFmpeg assemble a streamable cut — the
          real pipeline, live.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/studio"
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/90"
          >
            Open the Studio →
          </Link>
          <Link
            href="/system"
            className="rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/5"
          >
            Inspect the system
          </Link>
        </div>
        <p className="mt-4 text-xs text-white/40">
          {implemented} subsystems implemented &amp; unit-tested · self-hosted Wan 2.1 + Hunyuan on RunPod
        </p>
      </section>

      <section className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SUBSYSTEMS.map((f) => (
          <Link
            key={f.name}
            href="/system"
            className="rounded-xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-white/20"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{f.name}</h3>
              <Badge status={f.status} />
            </div>
            <p className="mt-2 text-sm text-white/55">{f.blurb}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}

function Badge({ status }: { status: string }) {
  const cls =
    status === "Implemented"
      ? "border-emerald-400/40 text-emerald-300"
      : status === "Stubbed"
        ? "border-sky-400/40 text-sky-300"
        : "border-white/20 text-white/50";
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] ${cls}`}>{status}</span>;
}
