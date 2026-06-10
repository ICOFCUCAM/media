/**
 * Prompt moderation gate — runs BEFORE any planning or GPU spend.
 *
 * Uses OpenAI's moderation endpoint (free, purpose-built) with thresholds
 * tuned for a film platform: dramatic conflict and action are normal
 * storytelling, so plain "violence" is NOT blocked — only graphic gore at
 * high confidence. Sexual content involving minors blocks at any signal.
 *
 * Fail-open by design: a moderation outage must not take down production.
 * Disable entirely with PROMPT_MODERATION=0 (e.g. local development).
 */

export interface ModerationVerdict {
  allowed: boolean;
  reason?: string;
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
  if (!key || process.env.PROMPT_MODERATION === "0") return { allowed: true };
  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "omni-moderation-latest", input: prompt }),
    });
    if (!res.ok) {
      console.warn(`[moderation] endpoint ${res.status} — failing open`);
      return { allowed: true };
    }
    const data = (await res.json()) as {
      results?: { category_scores?: Record<string, number> }[];
    };
    const scores = data.results?.[0]?.category_scores ?? {};
    for (const [category, threshold] of RULES) {
      if ((scores[category] ?? 0) >= threshold) {
        console.log(`[moderation] blocked: ${category} score=${(scores[category] ?? 0).toFixed(3)}`);
        return { allowed: false, reason: category };
      }
    }
    return { allowed: true };
  } catch (e) {
    console.warn("[moderation] check failed — failing open:", e instanceof Error ? e.message : e);
    return { allowed: true };
  }
}
