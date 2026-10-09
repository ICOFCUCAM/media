/**
 * Prompt change control (DirectorOS DOS-49.2, Part 1 §50.2: "every new prompt
 * change runs the benchmark"). Each registered prompt is fingerprinted — its
 * system text, how a request is rendered, and the output schema — and the
 * fingerprints are locked in `prompts.lock.json`. CI fails when:
 *
 *   - a prompt's fingerprint changed but its version did not (an edit that
 *     would make decision-log rows ambiguous), or
 *   - the lock is stale (a version moved without the lock being refreshed).
 *
 * Refreshing the lock (`pnpm --filter @cineforge/bench bench lock`) marks the
 * new version UNSCORED; its evaluation score comes from the live benchmark
 * (`bench:live`, recorded in benchmark_runs) — the offline benchmark runs in CI
 * on every change regardless.
 */
import { createHash } from "node:crypto";
import { EDITOR_SCHEMA, filmPackageJsonSchema, PROMPTS, renderPlanRequest, renderRevisionRequest } from "@cineforge/movie";

export interface PromptFingerprint {
  id: string;
  version: number;
  purpose: string;
  sha256: string;
}

export interface PromptLockEntry extends PromptFingerprint {
  /** Live benchmark score for this version (0..1), or null until one is run. */
  score: number | null;
  scoredAt: string | null;
  model: string | null;
}

export interface PromptLock {
  prompts: PromptLockEntry[];
}

const SAMPLE = {
  brief: "A courier crosses a harbour in a storm.",
  constraints: { sceneCount: 2, sceneSec: 10, sceneTolerance: 0.2, maxShotsPerScene: 3, maxShotSec: 5, targetSeconds: 20, filmTolerance: 0.2 },
  // The production section's wording is part of the prompt (W11).
  production: {
    format: "Series", medium: "animation" as const, style: { label: "Anime-inspired", look: "anime look", motion: "held poses" },
    narrated: true, episodes: 2, direction: ["Each act is one EPISODE."],
  },
};

/** What each prompt sends besides its system text (rendered on a fixed sample). */
function rendered(id: string): string {
  if (id === PROMPTS.directorMaster.id) {
    return [
      renderPlanRequest(SAMPLE.brief, SAMPLE.constraints),
      renderPlanRequest(SAMPLE.brief, SAMPLE.constraints, SAMPLE.production),
      JSON.stringify(filmPackageJsonSchema()),
    ].join("\n\u0000");
  }
  // The Editor's answer shape (W13) is part of its prompt.
  if (id === PROMPTS.editorReview.id) return JSON.stringify(EDITOR_SCHEMA);
  if (id === PROMPTS.directorRevision.id) return renderRevisionRequest({ sample: true }, "- [story/X] path: message") + JSON.stringify(filmPackageJsonSchema());
  return "";
}

export function promptFingerprints(): PromptFingerprint[] {
  return Object.values(PROMPTS).map((p) => ({
    id: p.id,
    version: p.version,
    purpose: p.purpose,
    sha256: createHash("sha256").update(`${p.system}\n\u0000${rendered(p.id)}`).digest("hex"),
  })).sort((a, b) => a.id.localeCompare(b.id));
}

/** Problems with the lock against the code (empty = in sync). */
export function checkPromptLock(lock: PromptLock, current: PromptFingerprint[] = promptFingerprints()): string[] {
  const out: string[] = [];
  const locked = new Map(lock.prompts.map((p) => [p.id, p]));
  for (const p of current) {
    const l = locked.get(p.id);
    if (!l) { out.push(`${p.id}: not in prompts.lock.json (run the lock command)`); continue; }
    if (l.version === p.version && l.sha256 !== p.sha256) out.push(`${p.id}@${p.version}: the prompt changed but its version did not — bump the version`);
    else if (l.version !== p.version) out.push(`${p.id}: lock has v${l.version}, code has v${p.version} — refresh the lock`);
  }
  for (const l of lock.prompts) if (!current.some((p) => p.id === l.id)) out.push(`${l.id}: in the lock but no longer registered`);
  return out;
}

/** The refreshed lock: unchanged entries keep their score, changed ones become unscored. */
export function refreshLock(lock: PromptLock | null, current: PromptFingerprint[] = promptFingerprints()): PromptLock {
  const old = new Map((lock?.prompts ?? []).map((p) => [p.id, p]));
  return {
    prompts: current.map((p) => {
      const l = old.get(p.id);
      const same = l && l.version === p.version && l.sha256 === p.sha256;
      return { ...p, score: same ? l!.score : null, scoredAt: same ? l!.scoredAt : null, model: same ? l!.model : null };
    }),
  };
}

/** Record a live score for the CURRENT version of a prompt. */
export function scorePrompt(lock: PromptLock, id: string, version: number, score: number, model: string | null, at = new Date()): PromptLock {
  return {
    prompts: lock.prompts.map((p) => (p.id === id && p.version === version ? { ...p, score, model, scoredAt: at.toISOString() } : p)),
  };
}
