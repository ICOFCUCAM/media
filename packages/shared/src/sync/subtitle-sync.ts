/**
 * SubtitleSynchronizer (docs/38 §AU.7; §AW.11 regression test 3): subtitle
 * timing is DERIVED from the authoritative dialogue timing — word timestamps
 * when the audio has them, otherwise the dialogue event — and snapped to
 * frames for display. It is never estimated independently of the dialogue.
 *
 * deriveSubtitles builds the cues; validateSubtitles checks subtitle events
 * already on a timeline against them; toCues feeds the existing SRT/VTT
 * builders (packages/shared/src/subtitles.ts).
 */
import type { FrameRate } from "../clock/rational";
import { snapToFrame, usToSeconds, type Us } from "../clock/time";
import type { DraftEvent } from "../timeline/build";
import type { Cue } from "../subtitles";
import { secs, severityFor, type SyncInput, type SyncIssue } from "./types";

export interface SubtitleCue {
  startUs: Us;
  endUs: Us;
  text: string;
  dialogueKey: string;
}

export interface SubtitleRules {
  maxChars: number;
  maxDurationUs: Us;
  minDurationUs: Us;
}

/** Common broadcast-style readability limits (configurable). */
export const DEFAULT_SUBTITLE_RULES: SubtitleRules = { maxChars: 84, maxDurationUs: 7_000_000n, minDurationUs: 833_333n };

interface Word { text: string; startUs: Us; endUs: Us }

function words(line: DraftEvent): Word[] | null {
  const w = line.payload?.words;
  if (!Array.isArray(w) || !w.length) return null;
  return w.map((x: { text: string; startUs: string | number | bigint; endUs: string | number | bigint }) => ({ text: String(x.text), startUs: BigInt(x.startUs), endUs: BigInt(x.endUs) }));
}

export function deriveSubtitles(events: DraftEvent[], fps: FrameRate, rules: SubtitleRules = DEFAULT_SUBTITLE_RULES): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const line of events.filter((e) => e.kind === "dialogue").sort((a, b) => (a.startUs < b.startUs ? -1 : 1))) {
    const text = String(line.payload?.text ?? "").trim();
    if (!text) continue;
    const w = words(line);
    const groups: Word[][] = [];
    if (w) {
      // Break at the reading limits, on word boundaries, following the spoken words.
      let cur: Word[] = [];
      for (const word of w) {
        const len = [...cur, word].map((x) => x.text).join(" ").length;
        if (cur.length && (len > rules.maxChars || word.endUs - cur[0]!.startUs > rules.maxDurationUs)) {
          groups.push(cur);
          cur = [];
        }
        cur.push(word);
      }
      if (cur.length) groups.push(cur);
    } else {
      groups.push([{ text, startUs: line.startUs, endUs: line.endUs }]);
    }
    for (const g of groups) {
      const start = snapToFrame(g[0]!.startUs, fps, "floor");
      let end = snapToFrame(g[g.length - 1]!.endUs, fps, "ceil");
      if (end - start < rules.minDurationUs) end = snapToFrame(start + rules.minDurationUs, fps, "ceil");
      cues.push({ startUs: start, endUs: end, text: g.map((x) => x.text).join(" "), dialogueKey: line.key });
    }
  }
  // A cue never runs into the next one.
  for (let i = 0; i + 1 < cues.length; i++) {
    if (cues[i]!.endUs > cues[i + 1]!.startUs) cues[i]!.endUs = cues[i + 1]!.startUs;
  }
  return cues;
}

/** Subtitle events already on the timeline vs cues derived from the dialogue. */
export function validateSubtitles(input: SyncInput, rules: SubtitleRules = DEFAULT_SUBTITLE_RULES): SyncIssue[] {
  const existing = input.events.filter((e) => e.kind === "subtitle");
  if (!existing.length) return [];
  const derived = deriveSubtitles(input.events, input.fps, rules);
  const tol = input.policy.tolerances.subtitleUs;
  const issues: SyncIssue[] = [];
  for (const sub of existing) {
    const key = sub.payload?.dialogueKey as string | undefined;
    const candidates = derived.filter((c) => !key || c.dialogueKey === key);
    const match = candidates.sort((a, b) => Number((a.startUs > sub.startUs ? a.startUs - sub.startUs : sub.startUs - a.startUs) - (b.startUs > sub.startUs ? b.startUs - sub.startUs : sub.startUs - b.startUs)))[0];
    if (!match) {
      issues.push({ check: "subtitle", severity: "error", eventId: sub.key, atUs: sub.startUs, measured: {}, expected: {}, confidence: 1,
        message: `${sub.key} has no dialogue to follow`, repair: { kind: "rebuild_subtitles", fromDialogue: true } });
      continue;
    }
    const ds = sub.startUs - match.startUs;
    const de = sub.endUs - match.endUs;
    const sev = severityFor(ds, tol) ?? severityFor(de, tol);
    if (sev) {
      issues.push({ check: "subtitle", severity: sev, eventId: sub.key, atUs: sub.startUs, spanUs: (ds < 0n ? -ds : ds) > (de < 0n ? -de : de) ? (ds < 0n ? -ds : ds) : (de < 0n ? -de : de),
        measured: { startUs: Number(sub.startUs), endUs: Number(sub.endUs) }, expected: { startUs: Number(match.startUs), endUs: Number(match.endUs) }, confidence: 1,
        message: `${sub.key} is ${secs(ds)} / ${secs(de)} (start / end) off the dialogue it captions`, repair: { kind: "rebuild_subtitles", fromDialogue: true } });
    }
  }
  return issues;
}

/** For buildSrt / buildVtt. */
export function toCues(cues: SubtitleCue[]): Cue[] {
  return cues.map((c) => ({ startSec: usToSeconds(c.startUs), endSec: usToSeconds(c.endUs), text: c.text }));
}
