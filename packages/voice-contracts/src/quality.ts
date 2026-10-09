/**
 * Reference recording quality (§160): garbage in, garbage clone out. A
 * recording is measured (worker, ffmpeg) and judged here before any voice is
 * created from it.
 */
export interface VoiceSampleFacts {
  durationSec: number;
  sampleRate: number;
  channels: number;
  /** Share of the recording that is silence (0..1). */
  silenceRatio: number;
  /** Highest sample level, dBFS. */
  peakDbfs: number;
  /** Background noise level in the quiet parts, dBFS (lower is cleaner). */
  noiseFloorDbfs: number | null;
}

export interface VoiceQualityReport {
  quality: "good" | "fair" | "poor";
  issues: string[];
  duration_seconds: number;
  sample_rate: number;
  channels: number;
  speech_ratio: number;
  clipping: boolean;
  noise_floor_dbfs: number | null;
}

export function judgeVoiceSample(f: VoiceSampleFacts): VoiceQualityReport {
  const poor: string[] = [];
  const fair: string[] = [];
  const speech = Math.max(0, 1 - f.silenceRatio);
  const clipping = f.peakDbfs >= -0.1;
  if (f.durationSec < 6) poor.push(`The recording is ${f.durationSec.toFixed(1)}s; at least 10 seconds of speech is needed.`);
  else if (f.durationSec < 10) fair.push("The recording is short; 20–60 seconds of clear speech gives a better voice.");
  if (f.durationSec > 300) fair.push("Only the first five minutes are needed.");
  if (f.sampleRate < 16000) poor.push(`The sample rate is ${f.sampleRate} Hz; record at 16 kHz or higher (44.1/48 kHz is best).`);
  else if (f.sampleRate < 24000) fair.push(`The sample rate is ${f.sampleRate} Hz; 44.1 or 48 kHz is better.`);
  if (speech < 0.4) poor.push("Most of the recording is silence.");
  else if (speech < 0.65) fair.push("There are long silences in the recording.");
  if (clipping) poor.push("There is significant clipping — record a little quieter.");
  if (f.noiseFloorDbfs !== null && f.noiseFloorDbfs > -40) poor.push("Background noise is high.");
  else if (f.noiseFloorDbfs !== null && f.noiseFloorDbfs > -50) fair.push("There is some background noise.");
  return {
    quality: poor.length ? "poor" : fair.length ? "fair" : "good",
    issues: [...poor, ...fair],
    duration_seconds: +f.durationSec.toFixed(2),
    sample_rate: f.sampleRate,
    channels: f.channels,
    speech_ratio: +speech.toFixed(2),
    clipping,
    noise_floor_dbfs: f.noiseFloorDbfs === null ? null : +f.noiseFloorDbfs.toFixed(1),
  };
}
