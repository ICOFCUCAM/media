import { CreateStudio } from "../../../../components/CreateStudio";
import { productById } from "../../../../lib/products";

export const metadata = { title: "Create a Series — Cineforge" };

export default function CreateSeriesPage() {
  const p = productById("series")!;
  return (
    <div>
      <CreateStudio
        kind="series"
        heading="Create a TV Series"
        blurb="Multi-episode shows with a persistent cast, season arcs and story continuity that never drifts."
        durations={p.durations}
        defaultSeconds={p.defaultSeconds}
        defaultPrompt="A political thriller series set in a near-future megacity, following a journalist uncovering a conspiracy across two seasons."
        cta="Create series"
      />
      <div className="mx-auto max-w-6xl px-6 pb-12">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "Episodes", d: "Auto-broken into episodes with cliffhangers and recaps." },
            { t: "Seasons", d: "Season-long arcs that pay off across episodes." },
            { t: "Character Memory", d: "Cast keep their look, voice and history throughout." },
            { t: "Story Continuity", d: "An event-sourced canon so the world stays consistent." },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="font-medium">{f.t}</div>
              <p className="mt-1 text-sm text-white/55">{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
