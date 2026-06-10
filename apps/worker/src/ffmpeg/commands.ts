/**
 * Pure FFmpeg argument builders (docs/10). These return the argument list AFTER
 * the global flags that the runner prepends (`-hide_banner -progress ...`), so
 * they're deterministic and unit-testable without spawning FFmpeg.
 */

export interface VideoFormat {
  width: number;
  height: number;
  fps: number;
}

export const DEFAULT_FORMAT: VideoFormat = { width: 1920, height: 1080, fps: 24 };

/** Normalize a clip to a uniform resolution / SAR / fps before concat. */
export function normalizeArgs(input: string, output: string, fmt: VideoFormat = DEFAULT_FORMAT): string[] {
  const { width, height, fps } = fmt;
  return [
    "-i", input,
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}`,
    "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-an",
    output,
  ];
}

/** Content of the concat demuxer list file (hard cuts within a scene). */
export function concatListContent(files: string[]): string {
  // Escape single quotes per ffmpeg concat format.
  return files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n";
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
  sfx?: string;
}

/**
 * Mix music + voice + sfx into one track, ducking music under dialogue with
 * sidechaincompress, then loudness-normalize (EBU R128).
 */
export function audioMixArgs(inputs: AudioInputs, output: string): string[] {
  const args: string[] = [];
  const labels: Record<string, number> = {};
  let idx = 0;
  for (const key of ["music", "voice", "sfx"] as const) {
    if (inputs[key]) {
      args.push("-i", inputs[key]!);
      labels[key] = idx++;
    }
  }
  if (idx === 0) throw new Error("audioMixArgs: at least one input required");

  const filters: string[] = [];
  const mixIns: string[] = [];

  if (labels.music !== undefined) filters.push(`[${labels.music}:a]volume=0.6[m]`);
  if (labels.sfx !== undefined) filters.push(`[${labels.sfx}:a]volume=0.8[s]`);

  if (labels.music !== undefined && labels.voice !== undefined) {
    filters.push(`[m][${labels.voice}:a]sidechaincompress=threshold=0.03:ratio=8:attack=5:release=300[mducked]`);
    mixIns.push("[mducked]", `[${labels.voice}:a]`);
  } else if (labels.music !== undefined) {
    mixIns.push("[m]");
  } else if (labels.voice !== undefined) {
    mixIns.push(`[${labels.voice}:a]`);
  }
  if (labels.sfx !== undefined) mixIns.push("[s]");

  filters.push(`${mixIns.join("")}amix=inputs=${mixIns.length}:normalize=0[premix]`);
  filters.push(`[premix]loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);

  return [...args, "-filter_complex", filters.join(";"), "-map", "[aout]", "-c:a", "aac", "-b:a", "192k", output];
}

/** Mux the assembled video with the mixed audio (+ optional soft subtitles). */
export function muxArgs(
  video: string,
  audio: string,
  output: string,
  opts: { subtitles?: string } = {},
): string[] {
  const args = ["-i", video, "-i", audio];
  if (opts.subtitles) args.push("-i", opts.subtitles);
  args.push("-map", "0:v", "-map", "1:a");
  if (opts.subtitles) args.push("-map", "2", "-c:s", "mov_text");
  args.push(
    // veryfast: the worker is a small instance and source quality is the
    // bound anyway; -shortest: a narration bed longer than the cut must not
    // extend the film with frozen video.
    "-c:v", "libx264", "-crf", "19", "-preset", "veryfast",
    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
    output,
  );
  return args;
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
