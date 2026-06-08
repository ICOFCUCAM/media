import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Storage } from "../storage/storage";
import { ffmpeg, type FfmpegRunner } from "./ffmpeg";
import {
  normalizeArgs,
  concatListContent,
  concatArgs,
  audioMixArgs,
  muxArgs,
  hlsArgs,
  DEFAULT_FORMAT,
  type VideoFormat,
} from "./commands";

export interface SceneAssets {
  sceneId: string;
  index: number;
  /** S3 keys of this scene's shot clips, in order. */
  shotKeys: string[];
  /** Optional S3 keys for this scene's audio. */
  musicKey?: string;
  voiceKey?: string;
  sfxKey?: string;
}

export interface RenderResult {
  mp4Key: string;
  hlsKey: string;
  posterKey: string;
}

/**
 * Real FFmpeg assembly (docs/10): normalize every shot, concat into a body,
 * mix ducked audio, mux, generate an HLS ladder, and upload everything to S3.
 * Storage + the ffmpeg runner are injected so the engine is testable.
 */
export class RenderEngine {
  constructor(
    private readonly storage: Storage,
    private readonly run: FfmpegRunner = ffmpeg,
    private readonly fmt: VideoFormat = DEFAULT_FORMAT,
  ) {}

  async renderFinal(
    projectId: string,
    scenes: SceneAssets[],
    onProgress?: (p: number) => void,
  ): Promise<RenderResult> {
    const work = await mkdtemp(join(tmpdir(), `cineforge-${projectId}-`));
    try {
      const allShotKeys = scenes.flatMap((s) => s.shotKeys);
      if (allShotKeys.length === 0) throw new Error("no shot clips to render");

      // 1) Download + normalize every shot.
      const normalized: string[] = [];
      let done = 0;
      for (const key of allShotKeys) {
        const raw = join(work, `raw_${done}.mp4`);
        const norm = join(work, `norm_${done}.mp4`);
        await this.storage.download(key, raw);
        await this.run(normalizeArgs(raw, norm, this.fmt));
        normalized.push(norm);
        done++;
        onProgress?.((done / allShotKeys.length) * 0.6); // normalize = 0..60%
      }

      // 2) Concat into the video body.
      const listPath = join(work, "list.txt");
      await writeFile(listPath, concatListContent(normalized));
      const body = join(work, "body.mp4");
      await this.run(concatArgs(listPath, body));
      onProgress?.(0.7);

      // 3) Mix audio (first scene that has any track drives the bed for the demo;
      //    full impl places per-scene tracks on a timeline — docs/11).
      const audioScene = scenes.find((s) => s.musicKey || s.voiceKey || s.sfxKey);
      let finalVideo = body;
      if (audioScene) {
        const dl = async (k?: string, name?: string) => {
          if (!k) return undefined;
          const p = join(work, name!);
          await this.storage.download(k, p);
          return p;
        };
        const music = await dl(audioScene.musicKey, "music.mp3");
        const voice = await dl(audioScene.voiceKey, "voice.wav");
        const sfx = await dl(audioScene.sfxKey, "sfx.wav");
        const mix = join(work, "mix.m4a");
        await this.run(audioMixArgs({ music, voice, sfx }, mix));
        const muxed = join(work, "muxed.mp4");
        await this.run(muxArgs(body, mix, muxed));
        finalVideo = muxed;
      }
      onProgress?.(0.8);

      // 4) Final MP4 + poster.
      const finalMp4 = join(work, "final.mp4");
      await this.run(["-i", finalVideo, "-c", "copy", "-movflags", "+faststart", finalMp4]);
      const poster = join(work, "poster.jpg");
      await this.run(["-i", finalMp4, "-frames:v", "1", "-q:v", "2", poster]);

      // 5) HLS ladder.
      const hlsDir = join(work, "hls");
      await mkdir(hlsDir, { recursive: true });
      await this.run(hlsArgs(finalMp4, hlsDir), (p) => onProgress?.(0.8 + p * 0.15));

      // 6) Upload.
      const mp4Key = `projects/${projectId}/film/final.mp4`;
      const posterKey = `projects/${projectId}/film/poster.jpg`;
      const hlsPrefix = `projects/${projectId}/film/hls`;
      await this.storage.upload(finalMp4, mp4Key, "video/mp4");
      await this.storage.upload(poster, posterKey, "image/jpeg");
      await this.storage.uploadDir(hlsDir, hlsPrefix);
      onProgress?.(1);

      return { mp4Key, posterKey, hlsKey: `${hlsPrefix}/master.m3u8` };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
}
