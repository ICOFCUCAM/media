"use client";

import { SUBSYSTEMS } from "../../../lib/system";
import { useRole } from "../../../components/RoleContext";
import { EmptyState, PageHeader, Section, Status } from "../../../components/cf/primitives";

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
      <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
        <EmptyState
          title={<>System <em>administration.</em></>}
          hint="GPU pools, queues, model routing and render infrastructure are only visible to platform operators. Creators never need to see them."
        />
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={() => setRole("admin")} className="cf-btn-line">
            Switch to Super
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="System administration / Infrastructure"
        title={<>The<br /><em>machine.</em></>}
        copy={
          <>
            <p>The engines that power every creator action — kept out of the studio. Each subsystem links to its design document.</p>
            <p><strong>Implemented subsystems ship with code and tests.</strong></p>
          </>
        }
        status={{ tone: "live", label: `${SUBSYSTEMS.filter((s) => s.status === "Implemented").length} / ${SUBSYSTEMS.length} implemented` }}
      />

      <Section id="compute" label="Subsystems" title="Compute, memory and render.">
        <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-2 lg:grid-cols-3">
          {SUBSYSTEMS.map((s, i) => (
            <a key={s.name} href={`${REPO}/${s.doc}`} className="flex min-h-[220px] flex-col bg-cf-bg p-6 transition hover:bg-cf-soft">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[11px] text-cf-muted">{String(i + 1).padStart(2, "0")}</span>
                <Status tone={s.status === "Implemented" ? "ok" : s.status === "Stubbed" ? "warn" : "idle"}>{s.status}</Status>
              </div>
              <h3 className="mt-6 font-display font-semibold text-[21px] leading-tight tracking-[-0.02em]">{s.name}</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-cf-muted">{s.blurb}</p>
              <p className="mt-auto pt-4 font-mono text-[12px] text-cf-dim">{s.doc} ↗</p>
            </a>
          ))}
        </div>
      </Section>

      <Section id="models" label="Lifecycle" title="Request → film.">
        <ol className="grid border-t border-cf-fg sm:grid-cols-2">
          {LIFECYCLE.map((step, i) => (
            <li key={i} className="grid grid-cols-[40px_1fr] border-b border-cf-line py-4 pr-6">
              <span className="font-mono text-[11px] text-cf-muted">{String(i + 1).padStart(2, "0")}</span>
              <span className="font-mono text-[11px] leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
        <p className="cf-label mt-6 leading-relaxed">
          Data, auth, realtime and storage run on Supabase (docs/25-supabase.md); GPU inference and FFmpeg run on separate worker services.
        </p>
      </Section>
    </div>
  );
}
