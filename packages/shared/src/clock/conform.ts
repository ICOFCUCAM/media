/**
 * Controlled frame-rate conversion (docs/38 §AU.4, §AW.11 regression test 2).
 *
 * Generated clips arrive at model-native rates (16 fps for Wan today). They are
 * conformed ONCE to the production rate by the render worker, with a recorded
 * method; the result is a versioned media derivative. Never re-timed
 * implicitly: the conform keeps the clip's duration (to within the last target
 * frame) and the plan states exactly which source frame each target frame
 * shows, so a 16 → 24 fps conversion cannot drift.
 */
import { ceilDiv, ClockError, framesDurationUs, type Us } from "./time";
import { formatFrameRate, sameRate, type FrameRate } from "./rational";

export type ConformMethod = "none" | "duplicate" | "interpolate";

export interface ConformPlan {
  method: ConformMethod;
  source: { fps: FrameRate; frameCount: bigint; durationUs: Us };
  target: { fps: FrameRate; frameCount: bigint; durationUs: Us };
  /** target duration − source duration; 0 ≤ padUs < one target frame. */
  padUs: Us;
  /** FFmpeg video filter that executes the plan (FFmpeg is the executor, not the authority). */
  ffmpegFilter: string | null;
}

/** JSON-safe record stored with the conformed media version (provenance). */
export interface ConformRecord {
  kind: "conform";
  method: ConformMethod;
  sourceFps: string;
  targetFps: string;
  sourceFrames: string;
  targetFrames: string;
  sourceDurationUs: string;
  targetDurationUs: string;
  padUs: string;
  filter: string | null;
}

/** Exact source duration as a rational: count · den / num seconds, in µs, rounded up. */
function exactDurationUs(count: bigint, fps: FrameRate): Us {
  return ceilDiv(count * 1_000_000n * BigInt(fps.den), BigInt(fps.num));
}

export function planConform(
  sourceFps: FrameRate,
  sourceFrames: number | bigint,
  targetFps: FrameRate,
  method: Exclude<ConformMethod, "none"> = "duplicate",
): ConformPlan {
  const count = BigInt(sourceFrames);
  if (count <= 0n) throw new ClockError(`cannot conform ${count} frames`);
  const sDur = framesDurationUs(count, sourceFps);
  if (sameRate(sourceFps, targetFps)) {
    return {
      method: "none",
      source: { fps: sourceFps, frameCount: count, durationUs: sDur },
      target: { fps: targetFps, frameCount: count, durationUs: sDur },
      padUs: 0n,
      ffmpegFilter: null,
    };
  }
  // Target frames whose start lies inside the source duration (exact rational):
  // ceil(count · sDen · tNum / (sNum · tDen)).
  const tCount = ceilDiv(
    count * BigInt(sourceFps.den) * BigInt(targetFps.num),
    BigInt(sourceFps.num) * BigInt(targetFps.den),
  );
  const tDur = framesDurationUs(tCount, targetFps);
  const pad = tDur - exactDurationUs(count, sourceFps);
  const rate = formatFrameRate(targetFps);
  return {
    method,
    source: { fps: sourceFps, frameCount: count, durationUs: sDur },
    target: { fps: targetFps, frameCount: tCount, durationUs: tDur },
    padUs: pad < 0n ? 0n : pad,
    ffmpegFilter:
      method === "duplicate"
        ? conformFilter(targetFps)
        : `minterpolate=fps=${rate}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir`,
  };
}

/**
 * The source frame shown by target frame `i` under "duplicate": the latest
 * source frame j whose timestamp, rounded to the target grid, is ≤ i —
 * i.e. j = ceil((2i+1)·sNum·tDen / (2·tNum·sDen)) − 1 (FFmpeg fps, round=near).
 */
export function sourceFrameFor(plan: ConformPlan, i: number | bigint): bigint {
  const n = BigInt(i);
  if (n < 0n || n >= plan.target.frameCount) throw new ClockError(`target frame ${n} outside the plan`);
  if (plan.method === "none") return n;
  const s = plan.source.fps;
  const t = plan.target.fps;
  const j = ceilDiv((2n * n + 1n) * BigInt(s.num) * BigInt(t.den), 2n * BigInt(t.num) * BigInt(s.den)) - 1n;
  return j < plan.source.frameCount ? j : plan.source.frameCount - 1n;
}

/** The FFmpeg filter that performs a duplicate-method conform to `fps`. */
export function conformFilter(fps: FrameRate): string {
  return `fps=fps=${formatFrameRate(fps)}:round=near:eof_action=pass`;
}

export function conformRecord(plan: ConformPlan): ConformRecord {
  return {
    kind: "conform",
    method: plan.method,
    sourceFps: formatFrameRate(plan.source.fps),
    targetFps: formatFrameRate(plan.target.fps),
    sourceFrames: plan.source.frameCount.toString(),
    targetFrames: plan.target.frameCount.toString(),
    sourceDurationUs: plan.source.durationUs.toString(),
    targetDurationUs: plan.target.durationUs.toString(),
    padUs: plan.padUs.toString(),
    filter: plan.ffmpegFilter,
  };
}
