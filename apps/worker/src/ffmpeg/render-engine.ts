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
    brand?: { logoKey?: string | null; primaryColor?: string },
  ): Promise<RenderResult> {
    const work = await mkdtemp(join(tmpdir(), `cineforge-${projectId}-`));
    try {
      const allShotKeys = scenes.flatMap((s) => s.shotKeys);
      if (allShotKeys.length === 0) throw new Error("no shot clips to render");

      // 1) Download + re-encode every shot to a byte-uniform stream so concat can
      // stream-copy them. Default is a LIGHT pass (ultrafast, native resolution) —
      // cheap enough for a 512MB worker, unlike the full 1080p normalize. Set
      // RENDER_NORMALIZE=1 to force the high-quality 1080p re-encode (needs a
      // bigger worker).
      const normalize = process.env.RENDER_NORMALIZE === "1";
      const clips: string[] = [];
      let done = 0;
      for (const key of allShotKeys) {
        const raw = join(work, `raw_${done}.mp4`);
        const norm = join(work, `norm_${done}.mp4`);
        console.log(`[render] download clip ${done + 1}/${allShotKeys.length} key=${key}`);
        await this.storage.download(key, raw);
        console.log(`[render] re-encode clip ${done + 1}/${allShotKeys.length}`);
        await this.run(
          normalize
            ? normalizeArgs(raw, norm, this.fmt)
            : [
                "-i", raw,
                "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,fps=16,format=yuv420p",
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-an",
                norm,
              ],
        );
        clips.push(norm);
        done++;
        onProgress?.((done / allShotKeys.length) * 0.6);
      }

      // 1b) Branded outro (AGENCY+/docs/33): the studio's logo on a brand-color
      // card, 2.5s, appended as one more clip. Font-free by design (logo image
      // over lavfi color) so it renders on any container. Failure skips quietly.
      if (brand && (brand.logoKey || brand.primaryColor)) {
        try {
          const color = (brand.primaryColor ?? "#6366f1").replace("#", "0x");
          const outro = join(work, "outro.mp4");
          if (brand.logoKey) {
            const logo = join(work, "logo.png");
            await this.storage.download(brand.logoKey, logo);
            await this.run([
              "-f", "lavfi", "-i", `color=c=${color}@0.25:s=1280x720:d=2.5:r=16`,
              "-i", logo,
              "-filter_complex", "[1]scale=320:-1[l];[0][l]overlay=(W-w)/2:(H-h)/2,format=yuv420p,fade=t=in:d=0.4,fade=t=out:st=2.1:d=0.4",
              "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-an", "-t", "2.5",
              outro,
            ]);
          } else {
            await this.run([
              "-f", "lavfi", "-i", `color=c=${color}@0.3:s=1280x720:d=2:r=16`,
              "-vf", "format=yuv420p,fade=t=in:d=0.4,fade=t=out:st=1.6:d=0.4",
              "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-an",
              outro,
            ]);
          }
          // Outro resolution may differ from body clips: re-encode pass keeps
          // concat valid (same vf chain as the light normalize above).
          const outroNorm = join(work, "outro_norm.mp4");
          await this.run(["-i", outro, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,fps=16,format=yuv420p", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-an", outroNorm]);
          clips.push(outroNorm);
          console.log(`[render] appended branded outro`);
        } catch (e) {
          console.warn(`[render] brand outro skipped:`, e instanceof Error ? e.message : e);
        }
      }

      // 2) Concat into the video body (stream copy — light, clips are uniform).
      const listPath = join(work, "list.txt");
      await writeFile(listPath, concatListContent(clips));
      const body = join(work, "body.mp4");
      console.log(`[render] concat ${clips.length} clips`);
      await this.run(concatArgs(listPath, body));
      onProgress?.(0.7);

      // 3) Mix audio. Narration: EVERY scene's voice track, concatenated in
      //    scene order, becomes the film's voice bed (roughly tracking scene
      //    boundaries; precise timeline placement is docs/11). Music/SFX come
      //    from the first scene that has one (single bed for now). Audio is an
      //    ENHANCEMENT: if any track fails to download or mix, ship the film
      //    without audio rather than failing the whole assembly.
      let finalVideo = body;
      try {
        const dl = async (k: string, name: string) => {
          const p = join(work, name);
          await this.storage.download(k, p);
          return p;
        };
        // Voice bed: ordered concat of per-scene narration.
        let voice: string | undefined;
        const voiceScenes = scenes.filter((s) => s.voiceKey);
        if (voiceScenes.length === 1) {
          voice = await dl(voiceScenes[0]!.voiceKey!, "voice_0.mp3");
        } else if (voiceScenes.length > 1) {
          const parts: string[] = [];
          for (const s of voiceScenes) parts.push(await dl(s.voiceKey!, `voice_${s.index}.mp3`));
          const vlist = join(work, "voices.txt");
          await writeFile(vlist, concatListContent(parts));
          voice = join(work, "voice_all.m4a");
          console.log(`[render] narration bed: ${parts.length} scene tracks`);
          await this.run(["-f", "concat", "-safe", "0", "-i", vlist, "-c:a", "aac", "-b:a", "160k", voice]);
        }
        const musicKey = scenes.find((s) => s.musicKey)?.musicKey;
        const sfxKey = scenes.find((s) => s.sfxKey)?.sfxKey;
        const music = musicKey ? await dl(musicKey, "music.mp3") : undefined;
        const sfx = sfxKey ? await dl(sfxKey, "sfx.wav") : undefined;
        if (voice || music || sfx) {
          const mix = join(work, "mix.m4a");
          await this.run(audioMixArgs({ music, voice, sfx }, mix));
          const muxed = join(work, "muxed.mp4");
          console.log(`[render] mux audio bed (voice=${!!voice} music=${!!music} sfx=${!!sfx})`);
          await this.run(muxArgs(body, mix, muxed));
          finalVideo = muxed;
        }
      } catch (e) {
        console.warn(`[render] audio mix failed, continuing without audio:`, e instanceof Error ? e.message : e);
      }
      onProgress?.(0.8);

      // 4) Final MP4 + poster.
      const finalMp4 = join(work, "final.mp4");
      await this.run(["-i", finalVideo, "-c", "copy", "-movflags", "+faststart", finalMp4]);
      const poster = join(work, "poster.jpg");
      await this.run(["-i", finalMp4, "-frames:v", "1", "-q:v", "2", poster]);

      // 5) Upload the MP4 + poster (the deliverable).
      const mp4Key = `projects/${projectId}/film/final.mp4`;
      const posterKey = `projects/${projectId}/film/poster.jpg`;
      console.log(`[render] upload final.mp4 + poster key=${mp4Key}`);
      await this.storage.upload(finalMp4, mp4Key, "video/mp4");
      await this.storage.upload(poster, posterKey, "image/jpeg");

      // 6) HLS ladder (optional — a full transcode, too heavy for a small worker;
      //    off by default. Set RENDER_HLS=1 to generate the streaming ladder).
      let hlsKey = mp4Key;
      if (process.env.RENDER_HLS === "1") {
        const hlsDir = join(work, "hls");
        await mkdir(hlsDir, { recursive: true });
        await this.run(hlsArgs(finalMp4, hlsDir), (p) => onProgress?.(0.8 + p * 0.15));
        const hlsPrefix = `projects/${projectId}/film/hls`;
        await this.storage.uploadDir(hlsDir, hlsPrefix);
        hlsKey = `${hlsPrefix}/master.m3u8`;
      }
      onProgress?.(1);

      return { mp4Key, posterKey, hlsKey };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
}
