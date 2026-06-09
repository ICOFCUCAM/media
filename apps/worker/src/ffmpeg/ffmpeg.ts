import { spawn } from "node:child_process";

/**
 * Spawn FFmpeg and resolve on success. Streams progress (0..1) via -progress.
 * See docs/10-ffmpeg-render.md.
 */
export function ffmpeg(args: string[], onProgress?: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-hide_banner", "-y", "-progress", "pipe:1", "-nostats", ...args]);
    let durationMs = 0;
    let stderr = "";

    proc.stderr.on("data", (b: Buffer) => {
      const s = b.toString();
      stderr += s;
      const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(s);
      if (m) durationMs = (+m[1]! * 3600 + +m[2]! * 60 + +m[3]!) * 1000;
    });
    proc.stdout.on("data", (b: Buffer) => {
      const m = /out_time_ms=(\d+)/.exec(b.toString());
      if (m && durationMs && onProgress) onProgress(Math.min(1, +m[1]! / 1000 / durationMs));
    });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-2000)}`)),
    );
  });
}

export type FfmpegRunner = typeof ffmpeg;
