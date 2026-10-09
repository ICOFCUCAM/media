/**
 * Pure FFmpeg argument builders (docs/10). These return the argument list AFTER
 * the global flags that the runner prepends (`-hide_banner -progress ...`), so
 * they're deterministic and unit-testable without spawning FFmpeg.
 */
import { conformFilter, MIX_SPECS, parseFrameRate, type DeliverySpec, type DuckSpec, type MixSpec } from "@cineforge/shared";

export interface VideoFormat {
  width: number;
  height: number;
  fps: number;
}

export const DEFAULT_FORMAT: VideoFormat = { width: 1920, height: 1080, fps: 24 };

/**
 * Normalize a clip to a uniform resolution / SAR / fps before concat. The
 * frame-rate step is the Master Clock's controlled conform (docs/38 §AU.4):
 * nearest-frame sampling with the last partial frame kept — exactly what
 * planConform / sourceFrameFor in @cineforge/shared describe.
 */
export function normalizeArgs(input: string, output: string, fmt: VideoFormat = DEFAULT_FORMAT): string[] {
  const { width, height, fps } = fmt;
  return [
    "-i", input,
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,${conformFilter(parseFrameRate(fps))}`,
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-an",
    output,
  ];
}

/** Content of the concat demuxer list file (hard cuts within a scene). */
export function concatListContent(files: string[]): string {
  // Escape single quotes per ffmpeg concat format.
  return files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n";
}

/** Join audio files of any format/rate end to end (concat filter, resampled to 48 kHz) into AAC. */
export function concatAudioArgs(inputs: string[], output: string): string[] {
  const filter = inputs.map((_, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`).join(";") +
    ";" + inputs.map((_, i) => `[a${i}]`).join("") + `concat=n=${inputs.length}:v=0:a=1[out]`;
  return [...inputs.flatMap((f) => ["-i", f]), "-filter_complex", filter, "-map", "[out]", "-c:a", "aac", "-b:a", "160k", output];
}

/** Concat normalized clips via the concat demuxer (stream copy). */
export function concatArgs(listPath: string, output: string): string[] {
  return ["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", output];
}

/** Crossfade two clips at a scene boundary. */
export function xfadeArgs(
  a: string,
  b: string,
  output: string,
  opts: { duration: number; offset: number },
): string[] {
  return [
    "-i", a, "-i", b,
    "-filter_complex",
    `[0][1]xfade=transition=fade:duration=${opts.duration}:offset=${opts.offset},format=yuv420p`,
    output,
  ];
}

export interface AudioInputs {
  music?: string;
  voice?: string;
  /** The ambience stem, placed on the film's timeline (soundStemArgs). */
  ambience?: string;
  /** The effects stem, placed on the film's timeline (soundStemArgs). */
  sfx?: string;
}

export interface MixOptions {
  /** Loop the score under the whole cut, bounded to this length. */
  musicLoopSec?: number;
  /** Stem levels and ducking (the production profile's mix spec). */
  mix?: MixSpec;
  /** Where the master must land (the sync policy's delivery spec). */
  delivery?: Pick<DeliverySpec, "integratedLufs" | "truePeakDbtp">;
}

/** loudnorm overshoots a little: aim this far under the delivery true-peak ceiling. */
export const TRUE_PEAK_MARGIN_DB = 0.5;

const duckFilter = (d: DuckSpec) => `sidechaincompress=threshold=${d.threshold}:ratio=${d.ratio}:attack=${d.attackMs}:release=${d.releaseMs}`;

/**
 * Mix the film's stems into one track (Part 1 §18, §20; W16). Dialogue is the
 * anchor: music and ambience are ducked under it (sidechain keyed by the
 * dialogue), placed effects are not; then the whole mix is loudness-normalised
 * to the sync policy's delivery target (EBU R128). The ambience and sfx inputs
 * are stems already placed on the film's timeline and levelled (soundStemArgs).
 */
export function audioMixArgs(inputs: AudioInputs, output: string, opts: MixOptions = {}): string[] {
  const mix = opts.mix ?? MIX_SPECS.cinematic;
  const delivery = opts.delivery ?? { integratedLufs: -16, truePeakDbtp: -1 };
  const args: string[] = [];
  const labels: Partial<Record<keyof AudioInputs, number>> = {};
  let idx = 0;
  for (const key of ["music", "voice", "ambience", "sfx"] as const) {
    if (inputs[key]) {
      // The film score is one clip; loop it under the whole cut, bounded to the
      // film's length so the mix (amix = longest input) always terminates.
      if (key === "music" && opts.musicLoopSec && opts.musicLoopSec > 0) args.push("-stream_loop", "-1", "-t", String(Math.ceil(opts.musicLoopSec)));
      args.push("-i", inputs[key]!);
      labels[key] = idx++;
    }
  }
  if (idx === 0) throw new Error("audioMixArgs: at least one input required");

  const filters: string[] = [];
  const mixIns: string[] = [];
  const voice = labels.voice;
  const ducked = [labels.music, labels.ambience].filter((l) => l !== undefined).length;
  // The dialogue keys every ducked stem and is mixed itself: split it once per use.
  let keys: string[] = [];
  if (voice !== undefined) {
    if (ducked) {
      keys = Array.from({ length: ducked }, (_, i) => `[vk${i}]`);
      filters.push(`[${voice}:a]asplit=${ducked + 1}${keys.join("")}[v]`);
    } else {
      filters.push(`[${voice}:a]anull[v]`);
    }
  }
  if (labels.music !== undefined) {
    filters.push(`[${labels.music}:a]volume=${mix.musicDb}dB[m]`);
    if (voice !== undefined) {
      filters.push(`[m]${keys.shift()}${duckFilter(mix.musicDuck)}[mducked]`);
      mixIns.push("[mducked]");
    } else mixIns.push("[m]");
  }
  if (labels.ambience !== undefined) {
    if (voice !== undefined) {
      filters.push(`[${labels.ambience}:a]${keys.shift()}${duckFilter(mix.ambienceDuck)}[aducked]`);
      mixIns.push("[aducked]");
    } else mixIns.push(`[${labels.ambience}:a]`);
  }
  if (voice !== undefined) mixIns.push("[v]");
  if (labels.sfx !== undefined) mixIns.push(`[${labels.sfx}:a]`);

  filters.push(`${mixIns.join("")}amix=inputs=${mixIns.length}:normalize=0[premix]`);
  filters.push(`[premix]loudnorm=I=${delivery.integratedLufs}:TP=${delivery.truePeakDbtp - TRUE_PEAK_MARGIN_DB}:LRA=${mix.loudnessRangeLu}[aout]`);

  return [...args, "-filter_complex", filters.join(";"), "-map", "[aout]", "-c:a", "aac", "-b:a", "192k", output];
}

/** One sound placed on the film's timeline. */
export interface PlacedSound {
  path: string;
  /** Where it starts in the film (seconds). */
  startSec: number;
  /** Loop it to this length (ambience beds); absent = play once (effects). */
  loopSec?: number;
  /** Fade in/out at its edges (looped beds). */
  fadeSec?: number;
}

/**
 * Build one stem (ambience or effects) on the film's timeline: every sound
 * resampled, levelled, faded, delayed to its start and summed, padded with
 * silence and cut to the film's length.
 */
export function soundStemArgs(sounds: PlacedSound[], levelDb: number, filmSec: number, output: string): string[] {
  if (!sounds.length) throw new Error("soundStemArgs: at least one sound required");
  const args: string[] = [];
  const filters: string[] = [];
  const labels: string[] = [];
  sounds.forEach((s, i) => {
    if (s.loopSec && s.loopSec > 0) args.push("-stream_loop", "-1", "-t", s.loopSec.toFixed(3));
    args.push("-i", s.path);
    const ms = Math.max(0, Math.round(s.startSec * 1000));
    const chain = [`aresample=48000`, `aformat=channel_layouts=stereo`, `volume=${levelDb}dB`];
    if (s.loopSec && s.fadeSec && s.loopSec > 2 * s.fadeSec) {
      chain.push(`afade=t=in:d=${s.fadeSec}`, `afade=t=out:st=${(s.loopSec - s.fadeSec).toFixed(3)}:d=${s.fadeSec}`);
    }
    if (ms > 0) chain.push(`adelay=${ms}|${ms}`);
    filters.push(`[${i}:a]${chain.join(",")}[s${i}]`);
    labels.push(`[s${i}]`);
  });
  filters.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=longest,apad[out]`);
  return [...args, "-filter_complex", filters.join(";"), "-map", "[out]", "-t", filmSec.toFixed(3), "-ar", "48000", "-c:a", "pcm_s16le", output];
}

/**
 * Mux the assembled video with the mixed audio (+ optional soft subtitles).
 *
 * Never `-shortest`: that silently cut narration whenever it ran longer than
 * the picture (docs/38 §AW.2, regression test 1). The output length is set
 * explicitly by the caller from the narration fit (`planNarrationFit`), so the
 * only audio that can be trimmed is the music/SFX tail beyond it.
 */
export function muxArgs(
  video: string,
  audio: string,
  output: string,
  opts: { subtitles?: string; durationSec?: number } = {},
): string[] {
  const args = ["-i", video, "-i", audio];
  if (opts.subtitles) args.push("-i", opts.subtitles);
  args.push("-map", "0:v", "-map", "1:a");
  if (opts.subtitles) args.push("-map", "2", "-c:s", "mov_text");
  if (opts.durationSec !== undefined) args.push("-t", opts.durationSec.toFixed(3));
  args.push(
    // veryfast: the worker is a small instance and source quality is the bound anyway.
    "-c:v", "libx264", "-crf", "19", "-preset", "veryfast",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
    output,
  );
  return args;
}

/** Hold the last frame for `extraSec` seconds (picture extended to fit narration). */
export function extendVideoArgs(input: string, output: string, extraSec: number): string[] {
  return [
    "-i", input,
    "-vf", `tpad=stop_mode=clone:stop_duration=${extraSec.toFixed(3)},format=yuv420p`,
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-an",
    output,
  ];
}

/** ffprobe arguments that print a media file's duration in seconds. */
export function probeDurationArgs(input: string): string[] {
  return ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", input];
}

/**
 * What to do when narration runs longer than the picture
 * (env RENDER_NARRATION_OVERRUN):
 *  - "fail" (default): timeline mismatch — the film is not rendered, and the
 *    reason is surfaced. Nothing is cut.
 *  - "extend": an explicit production decision to hold the last frame until
 *    the narration ends. Nothing is cut.
 * Truncating narration is not an available policy.
 */
export type NarrationOverrunPolicy = "fail" | "extend";

export interface NarrationFit {
  action: "fits" | "pad" | "extend" | "fail";
  pictureSec: number;
  narrationSec: number;
  overrunSec: number;
  /** Seconds of held last frame to add to the picture. */
  padSec: number;
  /** Final film length: never shorter than the narration. */
  outputSec: number;
}

export function planNarrationFit(input: {
  pictureSec: number;
  narrationSec: number;
  toleranceSec: number;
  policy: NarrationOverrunPolicy;
}): NarrationFit {
  const { pictureSec, narrationSec, toleranceSec, policy } = input;
  const overrunSec = Math.max(0, narrationSec - pictureSec);
  const base = { pictureSec, narrationSec, overrunSec };
  if (overrunSec === 0) return { ...base, action: "fits", padSec: 0, outputSec: pictureSec };
  // A small overrun (encoder padding, rounding) is absorbed by holding the
  // last frame — the narration still plays to its end.
  if (overrunSec <= toleranceSec) return { ...base, action: "pad", padSec: overrunSec, outputSec: narrationSec };
  if (policy === "extend") return { ...base, action: "extend", padSec: overrunSec, outputSec: narrationSec };
  return { ...base, action: "fail", padSec: 0, outputSec: pictureSec };
}

/** Narration longer than the picture beyond tolerance, with policy "fail". */
export class NarrationOverrunError extends Error {
  readonly code = "TIMELINE_MISMATCH";
  constructor(readonly fit: NarrationFit) {
    super(
      `timeline mismatch: narration is ${fit.narrationSec.toFixed(1)}s but the picture is ${fit.pictureSec.toFixed(1)}s ` +
        `(${fit.overrunSec.toFixed(1)}s over). Narration is never cut to fit — shorten the narration or add shots.`,
    );
    this.name = "NarrationOverrunError";
  }
}

/** Adaptive HLS ladder (1080/720/480) for streaming. */
export function hlsArgs(input: string, outDir: string): string[] {
  return [
    "-i", input,
    "-filter_complex",
    "[0:v]split=3[v1][v2][v3];[v1]scale=1920:1080[v1o];[v2]scale=1280:720[v2o];[v3]scale=854:480[v3o]",
    "-map", "[v1o]", "-map", "0:a", "-c:v:0", "libx264", "-b:v:0", "5000k",
    "-map", "[v2o]", "-map", "0:a", "-c:v:1", "libx264", "-b:v:1", "2800k",
    "-map", "[v3o]", "-map", "0:a", "-c:v:2", "libx264", "-b:v:2", "1200k",
    "-c:a", "aac", "-b:a", "128k",
    "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
    "-master_pl_name", "master.m3u8",
    "-var_stream_map", "v:0,a:0 v:1,a:0 v:2,a:0",
    `${outDir}/stream_%v.m3u8`,
  ];
}

/** Where the brand outro looks for a font (fonts-dejavu-core in the worker image). */
export const OUTRO_FONT = process.env.OUTRO_FONT_FILE ?? "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

/**
 * Lay the brand kit's outro line over the outro card. The text is read from a
 * file (textfile=) so a studio's words never need filter escaping, and
 * expansion=none keeps "%" literal (drawtext would otherwise expand it).
 */
export function outroTextArgs(input: string, output: string, textFile: string, fontFile: string = OUTRO_FONT): string[] {
  return [
    "-i", input,
    "-vf",
    `drawtext=fontfile=${fontFile}:textfile=${textFile}:expansion=none:fontcolor=white:fontsize=34:` +
      "x=(w-text_w)/2:y=h-(h/5):alpha='if(lt(t,0.4),t/0.4,1)',format=yuv420p",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-an",
    output,
  ];
}
