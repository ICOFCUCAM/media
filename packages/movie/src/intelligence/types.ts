/**
 * Provider-neutral intelligence layer (DirectorOS DOS-51, DOS-52, DOS-88).
 *
 * CineForge asks for REASONING through one interface; which model answers is
 * configuration (./router.ts), never code. Every call returns schema-shaped
 * JSON (DOS-25: never "just text") and is logged as an AI decision (DOS-48).
 */

/** What a call is for — the unit of routing and of the decision log. */
export type IntelligenceTask = "film_plan" | "film_plan_revision" | "translation" | "social_kit";

export interface StructuredRequest {
  task: IntelligenceTask;
  /** Prompt registry id + version (DOS-49), recorded with the decision. */
  promptId: string;
  promptVersion: number;
  system: string;
  user: string;
  /** JSON Schema the output must satisfy (validated again by CineForge). */
  schema: Record<string, unknown>;
  schemaName: string;
  maxTokens: number;
  /** Reasoning depth where the provider supports it. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

export interface StructuredResult {
  output: unknown;
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number };
  latencyMs: number;
}

export interface IntelligenceProvider {
  readonly id: string;
  /** False when the provider has no credentials — the router reports, never substitutes. */
  configured(): boolean;
  generateStructured(req: StructuredRequest, model: string): Promise<StructuredResult>;
}

export type IntelligenceErrorCode =
  | "PROVIDER_UNAVAILABLE" // no route / no credentials
  | "REFUSED" // the model declined (stop_reason refusal)
  | "TRUNCATED" // hit max_tokens — output incomplete
  | "NO_STRUCTURED_OUTPUT" // nothing parseable came back
  | "PROVIDER_ERROR"; // transport / API error after the SDK's retries

export class IntelligenceError extends Error {
  constructor(
    readonly code: IntelligenceErrorCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(`${code}: ${message}`);
    this.name = "IntelligenceError";
  }
}

/** One row of the AI decision log (DOS-48), written by the caller's recorder. */
export interface DecisionRecord {
  task: IntelligenceTask;
  promptId: string;
  promptVersion: number;
  schemaName: string;
  provider: string | null;
  model: string | null;
  /** sha256 of system + user + schema — what was asked, without storing prompts twice. */
  inputSha256: string;
  outputSha256: string | null;
  outcome: "ok" | "invalid" | "error";
  errorCode: string | null;
  issues: number;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  projectId: string | null;
  /** Which route attempt this was (0 = first choice). */
  attempt: number;
}
