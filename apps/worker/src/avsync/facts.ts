/**
 * Measure placed media into the facts the A/V Sync Engine reads (docs/38
 * §AU.7). Every value comes from the file — ffprobe frame counts, EBU R128,
 * silence / black / freeze detection, sha256 — never from what was requested.
 */
import type { MediaFacts, Us } from "@cineforge/shared";
import { measureBlack, measureFreezes, measureLoudness, measureSilences, probeStreams, sha256File } from "../ffmpeg/analysis";

export interface MeasureTarget {
  eventKey: string;
  kind: "video" | "audio";
  localPath: string;
  mediaVersionId?: string;
  generationRef?: string | null;
  /** The clip arrives at a model-native rate and has a recorded conform plan. */
  conformRecorded?: boolean;
}

export async function measureFacts(t: MeasureTarget): Promise<MediaFacts> {
  const streams = await probeStreams(t.localPath);
  const durationUs = streams.durationUs ?? undefined;
  const facts: MediaFacts = {
    eventKey: t.eventKey,
    kind: t.kind,
    mediaVersionId: t.mediaVersionId,
    generationRef: t.generationRef ?? null,
    sha256: await sha256File(t.localPath),
    durationUs,
    ...(streams.frameRate ? { frameRate: streams.frameRate } : {}),
    conformRecorded: t.conformRecorded ?? false,
  };
  if (t.kind === "video") {
    facts.blackIntervals = await measureBlack(t.localPath);
    facts.freezeIntervals = await measureFreezes(t.localPath, durationUs);
  } else {
    const l = await measureLoudness(t.localPath);
    if (l) facts.loudness = { integratedLufs: l.integratedLufs, truePeakDbtp: l.truePeakDbtp ?? -Infinity };
    const silences = await measureSilences(t.localPath, durationUs);
    const total: Us = durationUs ?? 0n;
    const lead = silences.find((s) => s.startUs === 0n);
    const tail = silences.find((s) => total > 0n && s.endUs >= total);
    if (lead) facts.leadingUs = lead.endUs;
    if (tail) facts.trailingUs = total - tail.startUs;
  }
  return facts;
}
