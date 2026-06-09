import { SUBSYSTEMS } from "../../lib/system";

const REPO = "https://github.com/ICOFCUCAM/media/blob/main";

export const metadata = { title: "Cineforge — System" };

export default function SystemPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <h1 className="text-3xl font-semibold">System</h1>
      <p className="mt-3 max-w-2xl text-white/60">
        The subsystems behind the Studio. Each links to its design doc in the
        repository. "Implemented" subsystems ship with code and unit tests;
        "Stubbed" have real structure with a marked integration point; "Design"
        are specified and ready to build.
      </p>

      <div className="mt-10 flex flex-col gap-3">
        {SUBSYSTEMS.map((s) => (
          <a
            key={s.name}
            href={`${REPO}/${s.doc}`}
            className="flex items-start justify-between gap-6 rounded-xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-white/20"
          >
            <div>
              <h2 className="text-base font-semibold">{s.name}</h2>
              <p className="mt-1 text-sm text-white/55">{s.blurb}</p>
              <p className="mt-2 font-mono text-xs text-white/35">{s.doc}</p>
            </div>
            <Status status={s.status} />
          </a>
        ))}
      </div>

      <section className="mt-12 rounded-xl border border-white/10 bg-white/[0.02] p-6">
        <h2 className="text-lg font-semibold">Request → film lifecycle</h2>
        <ol className="mt-4 grid gap-2 text-sm text-white/60 sm:grid-cols-2">
          {[
            "POST /generate-film → cost gate + GPU start-on-demand",
            "Director plans screenplay, bibles, scenes, shots",
            "BullMQ flow: render ← scene ← shots + music",
            "GPU pool generates shots (cache hits cost 0)",
            "Budget governor meters spend; pauses if over ceiling",
            "FFmpeg: normalize → concat → ducked mix → HLS",
            "film.ready over WebSocket → stream + download",
            "Queue drains → GPU auto-shutdown after grace",
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-white/30">{String(i + 1).padStart(2, "0")}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function Status({ status }: { status: string }) {
  const cls =
    status === "Implemented"
      ? "border-emerald-400/40 text-emerald-300"
      : status === "Stubbed"
        ? "border-sky-400/40 text-sky-300"
        : "border-white/20 text-white/50";
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${cls}`}>{status}</span>
  );
}
