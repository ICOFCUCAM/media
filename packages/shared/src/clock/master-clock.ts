/**
 * The Master Production Clock (docs/38 §AU.4, §AW.3): the sole temporal
 * authority of one production. It binds the production's single frame rate and
 * audio sample rate to the integer-µs timebase and is the only place the rest
 * of Cineforge converts between frames, samples, seconds and positions.
 *
 * Generated media is an execution result, not the source of truth: a clip's
 * duration is measured and compared against the clock (see the runtime timing
 * reports), never adopted as the production duration.
 */
import { planConform, type ConformMethod, type ConformPlan } from "./conform";
import { formatFrameRate, isProductionRate, parseFrameRate, type FrameRate } from "./rational";
import {
  ClockError,
  frameSpan,
  frameToUs,
  framesDurationUs,
  isFrameAligned,
  PRODUCTION_SAMPLE_RATE,
  sampleToUs,
  secondsToUs,
  snapToFrame,
  usToFrame,
  usToSample,
  type Rounding,
  type Us,
} from "./time";
import { usToTimecode, type TimecodeOptions } from "./timecode";

export interface MasterClockSpec {
  fps: FrameRate | string;
  sampleRate?: number;
  /** Allow a rate outside PRODUCTION_FRAME_RATES (tests, special deliveries). */
  allowNonStandardRate?: boolean;
}

export class MasterClock {
  readonly fps: FrameRate;
  readonly sampleRate: number;

  constructor(spec: MasterClockSpec) {
    this.fps = parseFrameRate(spec.fps);
    this.sampleRate = spec.sampleRate ?? PRODUCTION_SAMPLE_RATE;
    if (!spec.allowNonStandardRate && !isProductionRate(this.fps)) {
      throw new ClockError(`${formatFrameRate(this.fps)} is not a production frame rate`);
    }
    if (!Number.isSafeInteger(this.sampleRate) || this.sampleRate <= 0) {
      throw new ClockError(`invalid sample rate ${this.sampleRate}`);
    }
  }

  /** "24000/1001@48000" — how timelines record their clock. */
  get id(): string {
    return `${formatFrameRate(this.fps)}@${this.sampleRate}`;
  }

  frameStart(n: number | bigint): Us {
    return frameToUs(n, this.fps);
  }
  frameAt(us: Us): bigint {
    return usToFrame(us, this.fps);
  }
  sampleStart(k: number | bigint): Us {
    return sampleToUs(k, this.sampleRate);
  }
  sampleAt(us: Us): bigint {
    return usToSample(us, this.sampleRate);
  }
  /** Picture events (cuts, shot bounds) live on frame starts. */
  snapPicture(us: Us, mode: Rounding = "nearest"): Us {
    return snapToFrame(us, this.fps, mode);
  }
  /** Audio events are sample-accurate. */
  snapAudio(us: Us, mode: Rounding = "nearest"): Us {
    const k = usToSample(us, this.sampleRate);
    const start = sampleToUs(k, this.sampleRate);
    if (start === us || mode === "floor") return start;
    const next = sampleToUs(k + 1n, this.sampleRate);
    if (mode === "ceil") return next;
    return us - start < next - us ? start : next;
  }
  /** Subtitles are displayed on frames. */
  snapSubtitle(us: Us, mode: Rounding = "nearest"): Us {
    return snapToFrame(us, this.fps, mode);
  }
  isPictureAligned(us: Us): boolean {
    return isFrameAligned(us, this.fps);
  }
  frames(startUs: Us, endUs: Us): bigint {
    return frameSpan(startUs, endUs, this.fps);
  }
  framesDuration(count: number | bigint): Us {
    return framesDurationUs(count, this.fps);
  }
  /** A planned shot duration in seconds → whole frames → exact µs. */
  shotDurationUs(seconds: number, mode: Rounding = "nearest"): Us {
    return this.snapPicture(secondsToUs(seconds), mode);
  }
  timecode(us: Us, opts?: TimecodeOptions): string {
    return usToTimecode(us, this.fps, opts);
  }
  /** Plan the single controlled conversion of a clip into this production's rate. */
  conform(sourceFps: FrameRate | string, sourceFrames: number | bigint, method?: Exclude<ConformMethod, "none">): ConformPlan {
    return planConform(parseFrameRate(sourceFps), sourceFrames, this.fps, method);
  }
}
