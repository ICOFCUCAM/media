/**
 * LipSyncValidator (docs/38 §AU.9) — a QC process, not cosmetic post-processing.
 *
 *   1. read the approved dialogue timing (word timestamps, else the line)
 *   2. take the visual speaking activity in the line's shot ('action' events
 *      with payload.mouthActivity = true, from vision analysis, each with an
 *      analysis confidence)
 *   3. compare the two activity signals on a 10 ms grid
 *   4. measure the offset: the shift (±500 ms) that best aligns them
 *   5. speech with no visible mouth activity
 *   6. visible speaking with no corresponding dialogue
 *   7. weak evidence (little overlap even at the best shift, or low analysis
 *      confidence) → human review, never an automatic verdict
 *
 * Offsets use the policy's asymmetric window: audio may lead picture by at
 * most lipSyncLeadUs and lag it by at most lipSyncLagUs.
 */
import type { Us } from "../clock/time";
import type { DraftEvent } from "../timeline/build";
import { secs, type SyncInput, type SyncIssue } from "./types";

const BIN = 10_000n; // 10 ms
const MAX_SHIFT_BINS = 50; // ±500 ms

function bins(intervals: Array<{ startUs: Us; endUs: Us }>, from: Us, n: number): Uint8Array {
  const a = new Uint8Array(n);
  for (const iv of intervals) {
    const s = Number((iv.startUs - from) / BIN);
    const e = Number((iv.endUs - from + BIN - 1n) / BIN);
    for (let i = Math.max(0, s); i < Math.min(n, e); i++) a[i] = 1;
  }
  return a;
}

function speechIntervals(line: DraftEvent): Array<{ startUs: Us; endUs: Us }> {
  const w = line.payload?.words;
  if (Array.isArray(w) && w.length) return w.map((x: { startUs: string | number | bigint; endUs: string | number | bigint }) => ({ startUs: BigInt(x.startUs), endUs: BigInt(x.endUs) }));
  return [{ startUs: line.startUs, endUs: line.endUs }];
}

export function validateLipSync(input: SyncInput): SyncIssue[] {
  const issues: SyncIssue[] = [];
  const tol = input.policy.tolerances;
  const mouths = input.events.filter((e) => e.kind === "action" && e.payload?.mouthActivity === true);
  if (!mouths.length) return issues; // no visual analysis: nothing to measure (DialogueAligner still applies)
  const shots = input.events.filter((e) => e.kind === "shot");
  const lines = input.events.filter((e) => e.kind === "dialogue");

  for (const shot of shots) {
    const shotLines = lines.filter((l) => l.startUs < shot.endUs && l.endUs > shot.startUs);
    const shotMouths = mouths.filter((m) => m.startUs < shot.endUs && m.endUs > shot.startUs);
    const shotId = shot.refId ?? shot.key;
    // 6. visible speaking with no dialogue at all in the shot
    if (!shotLines.length) {
      for (const m of shotMouths) {
        issues.push({ check: "lip_sync", severity: "warning", shotId, eventId: m.key, atUs: m.startUs, spanUs: m.endUs - m.startUs,
          measured: { mouthActiveUs: Number(m.endUs - m.startUs) }, expected: { speechUs: 0 }, confidence: Number(m.payload?.confidence ?? 0.5),
          message: `Shot ${shotId}: visible speaking for ${secs(m.endUs - m.startUs)} with no dialogue`, repair: { kind: "human_review", reason: "speaking without dialogue" } });
      }
      continue;
    }
    for (const line of shotLines) {
      const from = (line.startUs < shot.startUs ? line.startUs : shot.startUs) - BigInt(MAX_SHIFT_BINS) * BIN;
      const to = (line.endUs > shot.endUs ? line.endUs : shot.endUs) + BigInt(MAX_SHIFT_BINS) * BIN;
      const n = Number((to - from) / BIN);
      const speech = bins(speechIntervals(line), from, n);
      const visual = bins(shotMouths, from, n);
      const speechBins = speech.reduce((s, x) => s + x, 0);
      if (!speechBins) continue;
      // 4. best shift: visual[i + k] vs speech[i]; k > 0 means picture moves later than sound (audio leads).
      let best = 0;
      let bestK = 0;
      for (let k = -MAX_SHIFT_BINS; k <= MAX_SHIFT_BINS; k++) {
        let m = 0;
        for (let i = 0; i < n; i++) if (speech[i] && visual[i + k]) m++;
        if (m > best || (m === best && Math.abs(k) < Math.abs(bestK))) [best, bestK] = [m, k];
      }
      const overlap = best / speechBins;
      const analysisConf = Math.min(...shotMouths.map((x) => Number(x.payload?.confidence ?? 0.5)), 1);
      const confidence = Number((Math.min(analysisConf, 0.4 + 0.6 * overlap)).toFixed(2));
      const offsetUs = BigInt(-bestK) * BIN; // + = audio late (lags)
      // 7. weak evidence → review
      if (overlap < 0.3 || confidence < 0.6) {
        issues.push({ check: "lip_sync", severity: "warning", shotId, eventId: line.key, atUs: line.startUs, spanUs: line.endUs - line.startUs,
          measured: { overlap: Number(overlap.toFixed(2)) }, expected: { overlap: 1 }, confidence,
          message: `Shot ${shotId}: speech and visible mouth activity barely match (${Math.round(overlap * 100)} % at best) — needs human review`,
          repair: { kind: "human_review", reason: "insufficient visual evidence for lip sync" } });
        continue;
      }
      // 4. offset outside the asymmetric window
      if (offsetUs > tol.lipSyncLagUs || -offsetUs > tol.lipSyncLeadUs) {
        issues.push({ check: "lip_sync", severity: (offsetUs < 0n ? -offsetUs : offsetUs) > 2n * tol.lipSyncLagUs ? "error" : "warning", shotId, eventId: line.key,
          atUs: line.startUs, spanUs: offsetUs < 0n ? -offsetUs : offsetUs,
          measured: { offsetUs: Number(offsetUs), overlap: Number(overlap.toFixed(2)) }, expected: { leadUs: Number(tol.lipSyncLeadUs), lagUs: Number(tol.lipSyncLagUs) }, confidence,
          message: `Shot ${shotId}: sound ${offsetUs > 0n ? "lags" : "leads"} the visible speech by ${secs(offsetUs < 0n ? -offsetUs : offsetUs)}`,
          repair: { kind: "regenerate_tail", shotId, fromUs: (line.startUs > shot.startUs ? line.startUs : shot.startUs) - shot.startUs, durationUs: shot.endUs - (line.startUs > shot.startUs ? line.startUs : shot.startUs), constraint: "approved_dialogue_timing" } });
      }
      // 5. speech with no visible mouth activity, after the best alignment
      const unmatched = speechBins - best;
      if (BigInt(unmatched) * BIN > tol.dialogueEndUs * 4n) {
        issues.push({ check: "lip_sync", severity: "warning", shotId, eventId: line.key, atUs: line.startUs, spanUs: BigInt(unmatched) * BIN,
          measured: { speechWithoutMouthUs: unmatched * 10_000 }, expected: { speechWithoutMouthUs: 0 }, confidence,
          message: `Shot ${shotId}: ${secs(BigInt(unmatched) * BIN)} of speech with no visible mouth movement` });
      }
    }
  }
  return issues;
}
