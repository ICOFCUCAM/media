const features = [
  { title: "AI Director", body: "Prompt → screenplay → scenes → shots, with cinematic camera planning." },
  { title: "Continuity Engine", body: "Characters, wardrobes, locations and story state stay consistent across hundreds of shots." },
  { title: "Self-hosted models", body: "Wan 2.1 (primary) + Hunyuan Video (premium) on RunPod A40 GPUs — no per-generation fees." },
  { title: "Auto GPU lifecycle", body: "GPUs start on demand and shut down after the last job — 70–95% lower GPU cost." },
  { title: "Full audio", body: "Voice, scene-aware music and sound effects, mixed and ducked automatically." },
  { title: "Render & stream", body: "FFmpeg assembles the cut into MP4 + adaptive HLS for streaming and download." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <section className="text-center">
        <p className="mb-4 inline-block rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-widest text-white/60">
          AI Film Generation Platform
        </p>
        <h1 className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-5xl font-semibold leading-tight text-transparent sm:text-6xl">
          Cineforge
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">
          Type a prompt. Get a finished, streamable film — screenplay, characters, voices,
          music, and a rendered cut — produced on self-hosted open-source video models.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <a
            href="https://github.com/ICOFCUCAM/media"
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/90"
          >
            View the code
          </a>
          <a
            href="https://github.com/ICOFCUCAM/media/tree/main/docs"
            className="rounded-lg border border-white/20 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/5"
          >
            Architecture docs
          </a>
        </div>
      </section>

      <section className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h3 className="text-base font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-white/60">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-20 border-t border-white/10 pt-8 text-center text-sm text-white/40">
        Cineforge — built to scale from 10 to 1,000,000 users.
      </footer>
    </main>
  );
}
