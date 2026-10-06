import type { ProjectStatus } from "../../lib/demo";

const ORDER: ProjectStatus[] = ["PLANNING", "GENERATING", "RENDERING", "READY"];

export interface PipelineStep {
  name: string;
  /** The run status during which this department works. */
  at: ProjectStatus;
  /** Shown before any run starts (defaults to "Automatic"). */
  idle?: string;
}

/**
 * The department list for a production, driven by the REAL run status from
 * useCreateRun — never by a timer. Before a run it states what each step is.
 */
export function Pipeline({ steps, status }: { steps: PipelineStep[]; status?: ProjectStatus | null }) {
  const runAt = status ? ORDER.indexOf(status) : -1;
  return (
    <ol className="border-t border-cf-line" aria-label="Production pipeline">
      {steps.map((step, i) => {
        const at = ORDER.indexOf(step.at);
        const label = runAt < 0 ? step.idle ?? "Automatic" : status === "READY" || runAt > at ? "Done" : runAt === at ? "In progress" : "Queued";
        return (
          <li key={step.name} className="grid min-h-[60px] grid-cols-[40px_1fr_auto] items-center gap-3 border-b border-cf-line">
            <span className="font-mono text-[11px] text-cf-muted">{String(i + 1).padStart(2, "0")}</span>
            <span className="font-display font-semibold text-[17px]">{step.name}</span>
            <span
              className={`font-sans text-[11px] font-medium uppercase tracking-[0.06em] ${
                label === "In progress" ? "text-cf-fg" : label === "Done" ? "text-cf-ok" : "text-cf-muted"
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
