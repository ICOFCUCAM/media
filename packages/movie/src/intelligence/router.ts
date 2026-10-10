/**
 * Task → provider router (DirectorOS DOS-51/52/88). No vendor is foundational:
 *
 *   INTELLIGENCE_ROUTES="film_plan=anthropic:claude-opus-5-5|openai:gpt-5;translation=anthropic:claude-sonnet-5-5"
 *
 * Each task has an ordered list of `provider:model` choices. The default for
 * every task is Claude (`anthropic:` + ANTHROPIC_MODEL, else claude-opus-5-5).
 * A later choice is tried only when one is EXPLICITLY configured, and every
 * attempt is recorded in the decision log — there is no silent substitution
 * (DOS-75). Invalid-but-parseable output is the caller's to judge (validator),
 * not a reason to switch providers.
 */
import { modelSafeSchema, restoreNulls } from "./schema-compat";
import { createHash } from "node:crypto";
import {
  IntelligenceError,
  type DecisionRecord,
  type IntelligenceProvider,
  type IntelligenceTask,
  type StructuredRequest,
  type StructuredResult,
} from "./types";

export const DEFAULT_MODEL = "claude-opus-5-5";

export interface Route {
  provider: string;
  model: string;
}

const TASKS: IntelligenceTask[] = ["film_plan", "film_plan_revision", "translation", "social_kit", "visual_review", "edit_interpret", "editorial"];

export function parseRoutes(env: Record<string, string | undefined>): Record<IntelligenceTask, Route[]> {
  const fallback: Route[] = [{ provider: "anthropic", model: env.ANTHROPIC_MODEL || DEFAULT_MODEL }];
  const out = Object.fromEntries(TASKS.map((t) => [t, fallback])) as Record<IntelligenceTask, Route[]>;
  for (const part of (env.INTELLIGENCE_ROUTES ?? "").split(";").map((s) => s.trim()).filter(Boolean)) {
    const [task, chain] = part.split("=").map((s) => s.trim());
    if (!task || !chain || !TASKS.includes(task as IntelligenceTask)) {
      throw new Error(`INTELLIGENCE_ROUTES: unknown task in "${part}"`);
    }
    out[task as IntelligenceTask] = chain.split("|").map((c) => {
      const i = c.indexOf(":");
      if (i <= 0) throw new Error(`INTELLIGENCE_ROUTES: "${c}" must be provider:model`);
      return { provider: c.slice(0, i).trim(), model: c.slice(i + 1).trim() };
    });
  }
  return out;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** A summarizer that throws or rambles never breaks the call. */
function summaryOf(req: StructuredRequest, output: unknown): string | null {
  try {
    const s = req.summarize?.(output)?.replace(/\s+/g, " ").trim();
    return s ? s.slice(0, 500) : null;
  } catch {
    return null;
  }
}

/** Errors after which the NEXT configured route may be tried. */
const RETRY_NEXT = new Set(["PROVIDER_UNAVAILABLE", "PROVIDER_ERROR", "REFUSED"]);

export class IntelligenceRouter {
  private readonly providers: Map<string, IntelligenceProvider>;
  private readonly routes: Record<IntelligenceTask, Route[]>;

  constructor(
    providers: IntelligenceProvider[],
    env: Record<string, string | undefined> = process.env,
    private readonly onDecision: (d: DecisionRecord) => void | Promise<void> = () => {},
  ) {
    this.providers = new Map(providers.map((p) => [p.id, p]));
    this.routes = parseRoutes(env);
  }

  routesFor(task: IntelligenceTask): Route[] {
    return this.routes[task];
  }

  /** Whether any route for the task has a configured provider (Capability Registry). */
  available(task: IntelligenceTask): boolean {
    return this.routes[task].some((r) => this.providers.get(r.provider)?.configured());
  }

  async call(req: StructuredRequest, ctx: { projectId?: string | null } = {}): Promise<StructuredResult> {
    const images = (req.images ?? []).map((i) => sha(i.data)).join(",");
    const inputSha256 = sha(`${req.system}\n\u0000${req.user}\n\u0000${JSON.stringify(req.schema)}${images ? `\n\u0000${images}` : ""}`);
    const routes = this.routes[req.task];
    let last: IntelligenceError | null = null;
    for (let attempt = 0; attempt < routes.length; attempt++) {
      const route = routes[attempt]!;
      const provider = this.providers.get(route.provider);
      const base = {
        task: req.task, promptId: req.promptId, promptVersion: req.promptVersion, schemaName: req.schemaName,
        provider: route.provider, model: route.model, inputSha256, projectId: ctx.projectId ?? null, attempt, issues: 0,
      };
      try {
        if (!provider) throw new IntelligenceError("PROVIDER_UNAVAILABLE", `unknown provider ${route.provider}`);
        if (!provider.configured()) throw new IntelligenceError("PROVIDER_UNAVAILABLE", `${route.provider} is not configured`);
        // Providers get a flattened schema within their union limits; the answer is
        // turned back (nulls restored) before anyone reads it.
        const raw = await provider.generateStructured({ ...req, schema: modelSafeSchema(req.schema) }, route.model);
        const result = { ...raw, output: restoreNulls(raw.output, req.schema) };
        await this.onDecision({
          ...base, model: result.model, outputSha256: sha(JSON.stringify(result.output)), outcome: "ok", errorCode: null,
          inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, latencyMs: result.latencyMs,
          summary: summaryOf(req, result.output),
        });
        return result;
      } catch (e) {
        const err = e instanceof IntelligenceError ? e : new IntelligenceError("PROVIDER_ERROR", e instanceof Error ? e.message : String(e));
        await this.onDecision({ ...base, outputSha256: null, outcome: "error", errorCode: err.code, inputTokens: null, outputTokens: null, latencyMs: null });
        last = err;
        if (!RETRY_NEXT.has(err.code)) throw err;
      }
    }
    throw last ?? new IntelligenceError("PROVIDER_UNAVAILABLE", `no route for ${req.task}`);
  }
}
