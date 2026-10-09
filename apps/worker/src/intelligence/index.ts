/**
 * The worker's intelligence layer: one router for every reasoning call
 * (Director plan, revision, translation, social kit), with each call written to
 * the AI decision log (migration 0032; tolerated until applied — the JSON log
 * line is always written).
 */
import { prisma } from "@cineforge/db";
import { AnthropicProvider, IntelligenceRouter, OpenAIProvider, type DecisionRecord } from "@cineforge/movie";
import { isMissingTable } from "../timeline/store";

export interface DecisionDb {
  aiDecision: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}

let tableMissing = false;

export async function recordDecision(db: DecisionDb, d: DecisionRecord): Promise<"recorded" | "logged"> {
  console.log(JSON.stringify({ event: "ai.decision", ...d }));
  if (tableMissing) return "logged";
  try {
    await db.aiDecision.create({
      data: {
        projectId: d.projectId, task: d.task, promptId: d.promptId, promptVersion: d.promptVersion,
        schemaName: d.schemaName, provider: d.provider, model: d.model, attempt: d.attempt,
        inputSha256: d.inputSha256, outputSha256: d.outputSha256, outcome: d.outcome, errorCode: d.errorCode,
        issues: d.issues, inputTokens: d.inputTokens, outputTokens: d.outputTokens, latencyMs: d.latencyMs,
        ...(d.summary ? { summary: d.summary } : {}),
      },
    });
    return "recorded";
  } catch (e) {
    if (isMissingTable(e)) {
      tableMissing = true;
      console.warn('{"event":"ai.decision","note":"ai_decisions not migrated (0032); logging only until restart"}');
    } else {
      console.error(JSON.stringify({ event: "ai.decision", error: e instanceof Error ? e.message : String(e) }));
    }
    return "logged";
  }
}

/** Test hook. */
export function _resetDecisionState(): void {
  tableMissing = false;
}

let router: IntelligenceRouter | null = null;

/** The process-wide router (env read once). */
export function intelligence(): IntelligenceRouter {
  router ??= new IntelligenceRouter(
    [new AnthropicProvider(process.env), new OpenAIProvider(process.env)],
    process.env,
    (d) => recordDecision(prisma as unknown as DecisionDb, d).then(() => undefined),
  );
  return router;
}
