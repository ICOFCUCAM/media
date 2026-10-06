/**
 * Runtime timing reports (docs/38 §AV.5). Every video or audio result from a
 * runtime (Diffusers today, ComfyUI later) carries a report of what it
 * ACTUALLY produced, measured from the output. These types are the Cineforge
 * side of the contract: wire JSON (integer numbers) is parsed strictly into
 * clock values (bigint µs, exact rational rates). A result without a valid
 * report is invalid, even when media was produced.
 */
import { frameRate, sameRate, type FrameRate } from "../clock/rational";
import { framesDurationUs, type Us } from "../clock/time";

export type ConformApplied = "none" | "duplicate" | "interpolate" | "trim" | "pad";
const CONFORMS: readonly ConformApplied[] = ["none", "duplicate", "interpolate", "trim", "pad"];

export interface VideoTimingReport {
  kind: "video";
  requestedDurationUs: Us;
  /** Measured from the produced file, never echoed from the request. */
  actualDurationUs: Us;
  containerDurationUs: Us | null;
  timingAccuracy: { deltaUs: Us; ratio: number };
  frameRate: FrameRate;
  timebase: { num: number; den: number };
  frameCount: number;
  requestedFrameRate: FrameRate;
  conformApplied: ConformApplied;
  measuredBy: string;
}

export interface TimedWord {
  text: string;
  startUs: Us;
  endUs: Us;
  confidence?: number;
}

export interface AudioTimingReport {
  kind: "audio";
  requestedStartUs: Us;
  requestedEndUs: Us;
  /** First / last non-silent sample relative to the requested anchor. */
  actualStartUs: Us;
  actualEndUs: Us;
  durationUs: Us;
  wordTimestamps?: TimedWord[];
  phonemeTimestamps?: Array<{ symbol: string; startUs: Us; endUs: Us }>;
  sampleRate: number;
  loudness: { integratedLufs: number; truePeakDbtp: number; lra?: number };
}

export type TimingReport = VideoTimingReport | AudioTimingReport;

export type TimingReportProblem = "TIMING_REPORT_MISSING" | "TIMING_REPORT_INVALID";

export type ParsedTimingReport<R> = { ok: true; report: R } | { ok: false; code: TimingReportProblem; message: string };

class Invalid extends Error {}

type Json = Record<string, unknown>;

function obj(v: unknown, path: string): Json {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Invalid(`${path} must be an object`);
  return v as Json;
}

function int(v: unknown, path: string, { min = 0n }: { min?: bigint | null } = {}): bigint {
  let n: bigint;
  if (typeof v === "number" && Number.isSafeInteger(v)) n = BigInt(v);
  else if (typeof v === "string" && /^-?\d+$/.test(v)) n = BigInt(v);
  else if (typeof v === "bigint") n = v;
  else throw new Invalid(`${path} must be an integer`);
  if (min !== null && n < min) throw new Invalid(`${path} must be ≥ ${min}`);
  return n;
}

function num(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Invalid(`${path} must be a finite number`);
  return v;
}

function rate(v: unknown, path: string): FrameRate {
  const o = obj(v, path);
  try {
    return frameRate(Number(int(o.num, `${path}.num`, { min: 1n })), Number(int(o.den, `${path}.den`, { min: 1n })));
  } catch (e) {
    throw new Invalid(e instanceof Error ? e.message : String(e));
  }
}

function parse<R>(json: unknown, kind: string, build: (o: Json) => R): ParsedTimingReport<R> {
  if (json === null || json === undefined) {
    return { ok: false, code: "TIMING_REPORT_MISSING", message: "the runtime returned no timing report" };
  }
  try {
    const o = obj(json, "timing");
    if (o.kind !== undefined && o.kind !== kind) throw new Invalid(`timing.kind must be ${kind}`);
    return { ok: true, report: build(o) };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, code: "TIMING_REPORT_INVALID", message: e.message };
    throw e;
  }
}

/** Parse and cross-check a video timing report from a runtime response. */
export function parseVideoTimingReport(json: unknown): ParsedTimingReport<VideoTimingReport> {
  return parse(json, "video", (o) => {
    const requested = int(o.requestedDurationUs, "requestedDurationUs", { min: 1n });
    const actual = int(o.actualDurationUs, "actualDurationUs");
    const fps = rate(o.frameRate, "frameRate");
    const frameCount = Number(int(o.frameCount, "frameCount", { min: 1n }));
    const acc = obj(o.timingAccuracy, "timingAccuracy");
    const delta = int(acc.deltaUs, "timingAccuracy.deltaUs", { min: null });
    if (delta !== actual - requested) throw new Invalid("timingAccuracy.deltaUs ≠ actual − requested");
    // The duration must follow from the frames the file contains (±1 µs rounding).
    const fromFrames = framesDurationUs(frameCount, fps);
    if (actual - fromFrames > 1n || fromFrames - actual > 1n) {
      throw new Invalid(`actualDurationUs ${actual} disagrees with ${frameCount} frames at ${fps.num}/${fps.den}`);
    }
    const conform = (o.conformApplied ?? "none") as ConformApplied;
    if (!CONFORMS.includes(conform)) throw new Invalid(`unknown conformApplied ${String(o.conformApplied)}`);
    const tb = o.timebase === undefined ? { num: 1, den: fps.num } : rate(o.timebase, "timebase");
    return {
      kind: "video",
      requestedDurationUs: requested,
      actualDurationUs: actual,
      containerDurationUs: o.containerDurationUs == null ? null : int(o.containerDurationUs, "containerDurationUs"),
      timingAccuracy: { deltaUs: delta, ratio: Number(actual) / Number(requested) },
      frameRate: fps,
      timebase: tb,
      frameCount,
      requestedFrameRate: rate(o.requestedFrameRate, "requestedFrameRate"),
      conformApplied: conform,
      measuredBy: typeof o.measuredBy === "string" ? o.measuredBy : "unknown",
    };
  });
}

export function parseAudioTimingReport(json: unknown): ParsedTimingReport<AudioTimingReport> {
  return parse(json, "audio", (o) => {
    const rs = int(o.requestedStartUs, "requestedStartUs");
    const re = int(o.requestedEndUs, "requestedEndUs");
    const as = int(o.actualStartUs, "actualStartUs");
    const ae = int(o.actualEndUs, "actualEndUs");
    if (re <= rs) throw new Invalid("requestedEndUs must be after requestedStartUs");
    if (ae < as) throw new Invalid("actualEndUs must not be before actualStartUs");
    const loud = obj(o.loudness, "loudness");
    const words = o.wordTimestamps === undefined ? undefined : (o.wordTimestamps as unknown[]);
    if (words !== undefined && !Array.isArray(words)) throw new Invalid("wordTimestamps must be an array");
    return {
      kind: "audio",
      requestedStartUs: rs,
      requestedEndUs: re,
      actualStartUs: as,
      actualEndUs: ae,
      durationUs: int(o.durationUs, "durationUs"),
      wordTimestamps: words?.map((w, i) => {
        const x = obj(w, `wordTimestamps[${i}]`);
        const startUs = int(x.startUs, `wordTimestamps[${i}].startUs`);
        const endUs = int(x.endUs, `wordTimestamps[${i}].endUs`);
        if (endUs < startUs) throw new Invalid(`wordTimestamps[${i}] ends before it starts`);
        return { text: String(x.text ?? ""), startUs, endUs, ...(typeof x.confidence === "number" ? { confidence: x.confidence } : {}) };
      }),
      sampleRate: Number(int(o.sampleRate, "sampleRate", { min: 1n })),
      loudness: {
        integratedLufs: num(loud.integratedLufs, "loudness.integratedLufs"),
        truePeakDbtp: num(loud.truePeakDbtp, "loudness.truePeakDbtp"),
        ...(loud.lra === undefined ? {} : { lra: num(loud.lra, "loudness.lra") }),
      },
    };
  });
}

/** Whether the produced rate is the one the request asked the runtime for. */
export function producedRequestedRate(r: VideoTimingReport): boolean {
  return sameRate(r.frameRate, r.requestedFrameRate);
}
