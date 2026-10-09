/**
 * Prompt moderation gate — runs BEFORE any planning or GPU spend.
 *
 * Uses OpenAI's moderation endpoint (free, purpose-built) with thresholds
 * tuned for a film platform: dramatic conflict and action are normal
 * storytelling, so plain "violence" is NOT blocked — only graphic gore at
 * high confidence. Sexual content involving minors blocks at any signal.
 *
 * When the check cannot run (no key, PROMPT_MODERATION=0, endpoint error) the
 * verdict says so: `checked: false` with the reason. The film processor then
 * either fails the job (MODERATION_REQUIRED=1) or records a visible
 * MODERATION_SKIPPED degradation — it is never silently treated as passed
 * (DirectorOS DOS-75).
 */
import { providerUrl } from "@cineforge/shared";

export interface ModerationVerdict {
  allowed: boolean;
  reason?: string;
  /** False when no moderation actually ran. */
  checked: boolean;
  /** Why it did not run (no-key | disabled | http-<status> | error). */
  unchecked?: string;
}

// [category, score threshold 0..1] — lower = stricter.
const RULES: [string, number][] = [
  ["sexual/minors", 0.02],
  ["sexual", 0.6],
  ["hate/threatening", 0.5],
  ["hate", 0.75],
  ["harassment/threatening", 0.75],
  ["self-harm/instructions", 0.5],
  ["self-harm/intent", 0.6],
  ["illicit/violent", 0.7],
  ["violence/graphic", 0.85],
];

export async function moderatePrompt(prompt: string): Promise<ModerationVerdict> {
  const key = process.env.OPENAI_API_KEY;
  if (process.env.PROMPT_MODERATION === "0") return { allowed: true, checked: false, unchecked: "disabled" };
  if (!key) return { allowed: true, checked: false, unchecked: "no-key" };
  try {
    const res = await fetch(`${providerUrl("openai")}/moderations`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "omni-moderation-latest", input: prompt }),
    });
    if (!res.ok) {
      console.warn(`[moderation] endpoint ${res.status} — not checked`);
      return { allowed: true, checked: false, unchecked: `http-${res.status}` };
    }
    const data = (await res.json()) as {
      results?: { category_scores?: Record<string, number> }[];
    };
    const scores = data.results?.[0]?.category_scores ?? {};
    for (const [category, threshold] of RULES) {
      if ((scores[category] ?? 0) >= threshold) {
        console.log(`[moderation] blocked: ${category} score=${(scores[category] ?? 0).toFixed(3)}`);
        return { allowed: false, reason: category, checked: true };
      }
    }
    return { allowed: true, checked: true };
  } catch (e) {
    console.warn("[moderation] check failed — not checked:", e instanceof Error ? e.message : e);
    return { allowed: true, checked: false, unchecked: "error" };
  }
}
