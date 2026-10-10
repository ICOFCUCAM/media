import type { GateResult } from "../quality/gates";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Storage } from "../storage/storage";
import { degradation, MIX_SPECS, ProductionFailure, type Degradation, type DeliverySpec, type MixSpec } from "@cineforge/shared";
import { placeCue } from "@cineforge/movie";
import { ffmpeg, probeDuration, type DurationProbe, type FfmpegRunner } from "./ffmpeg";
import { sha256File } from "./analysis";
import {
  normalizeArgs,
  interpolating,
  interpolateFilter,
  concatAudioArgs,
  concatListContent,
  concatArgs,
  audioMixArgs,
  soundStemArgs,
  type PlacedSound,
  muxArgs,
  extendVideoArgs,
  planNarrationFit,
  NarrationOverrunError,
  hlsArgs,
  outroTextArgs,
  OUTRO_FONT,
  DEFAULT_FORMAT,
  type NarrationOverrunPolicy,
  type VideoFormat,
} from "./commands";

/** Frame rate of the default (light) assembly pass; RENDER_NORMALIZE=1 conforms to DEFAULT_FORMAT instead. */
export const LIGHT_FPS = 16;

/** The light pass's frame rate: 16, or 24 when frames are interpolated (W21). */
export function lightFps(env: Record<string, string | undefined> = process.env): number {
  return interpolating(env) ? 24 : LIGHT_FPS;
}
/** The light pass's rate step: drop/repeat frames, or interpolate new ones (W21). */
function lightRate(env: Record<string, string | undefined> = process.env): string {
  return interpolating(env) ? interpolateFilter(lightFps(env)) : `fps=${LIGHT_FPS}`;
}

/** What a master is delivered as: the light pass keeps the clips' size at LIGHT_FPS; normalize conforms to DEFAULT_FORMAT. */
export function masterFormat(env: Record<string, string | undefined>, clipSize: { width: number; height: number }): { width: number; height: number; fps: number } {
  return env.RENDER_NORMALIZE === "1" ? { width: DEFAULT_FORMAT.width, height: DEFAULT_FORMAT.height, fps: Number(DEFAULT_FORMAT.fps) } : { ...clipSize, fps: lightFps(env) };
}

export interface SceneAssets {
  sceneId: string;
  index: number;
  /** S3 keys of this scene's shot clips, in order. */
  shotKeys: string[];
  /** The editor's cut length per clip (W13), aligned with shotKeys; null/absent = the whole clip. */
  shotCutSec?: (number | null)[];
  /** Optional S3 keys for this scene's audio. */
  musicKey?: string;
  voiceKey?: string;
  /** The scene's sound design (W16): its ambience bed and placed effects. */
  sounds?: SceneSound[];
}

export interface SceneSound {
  kind: "AMBIENCE" | "SFX";
  key: string;
  /** Planned start within the scene (ms) and the scene's planned length it refers to. */
  startMs: number;
  durationMs: number;
  plannedSceneMs?: number;
}

export interface RenderResult {
  mp4Key: string;
  hlsKey: string;
  posterKey: string;
  /** SHA-256 of the delivered MP4 (its media version). */
  sha256: string;
  /** What this render ran without (recorded and shown, DOS-75). */
  degradations: Degradation[];
  /** Final Quality Gate results on the master (W5), when a gate was given. */
  quality: GateResult[];
}

/** Final Quality Gate: judges the local master before anything is uploaded. */
export type MasterGate = (localMp4: string, ctx: { hasSound: boolean; filmSec: number | undefined }) => Promise<GateResult[]>;

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
    private readonly probe: DurationProbe = probeDuration,
  ) {}

  async renderFinal(
    projectId: string,
    scenes: SceneAssets[],
    onProgress?: (p: number) => void,
    brand?: { logoKey?: string | null; primaryColor?: string; outroText?: string | null },
    opts: {
      filmSec?: number; gate?: MasterGate; version?: number; mix?: MixSpec; delivery?: Pick<DeliverySpec, "integratedLufs" | "truePeakDbtp">;
      /** Where the master goes instead of projects/<id>/film[/v<n>] — a dubbed language's own master (W22). */
      dir?: string;
    } = {},
  ): Promise<RenderResult> {
    const work = await mkdtemp(join(tmpdir(), `cineforge-${projectId}-`));
    const gaps: Degradation[] = [];
    try {
      const allShotKeys = scenes.flatMap((s) => s.shotKeys);
      const allCuts = scenes.flatMap((s) => s.shotKeys.map((_, i) => s.shotCutSec?.[i] ?? null));
      // Which scene each clip belongs to, and each clip's length as cut — the
      // scene spans the sound design is placed on (measured only when needed).
      const clipScene = scenes.flatMap((s, si) => s.shotKeys.map(() => si));
      const placeSounds = scenes.some((s) => s.sounds?.length);
      const clipSec: number[] = [];
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
        const args = normalize
          ? normalizeArgs(raw, norm, this.fmt)
          : [
              "-i", raw,
              "-vf", `scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,${lightRate()},format=yuv420p`,
              "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-an",
              norm,
            ];
        await this.run(withCut(args, allCuts[done] ?? null));
        clips.push(norm);
        if (placeSounds) clipSec.push(await this.probe(norm));
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
          // The kit's outro line, best-effort: drawtext needs a font, and the
          // logo card above must still ship if no font is available.
          let card = outro;
          const line = brand.outroText?.trim();
          if (line && existsSync(OUTRO_FONT)) {
            try {
              const textFile = join(work, "outro.txt");
              await writeFile(textFile, line.slice(0, 120));
              const withText = join(work, "outro_text.mp4");
              await this.run(outroTextArgs(outro, withText, textFile));
              card = withText;
            } catch (e) {
              console.warn(`[render] outro line skipped:`, e instanceof Error ? e.message : e);
              gaps.push(degradation("BRAND_OUTRO_SKIPPED", "film", "The brand outro was added without its text line.", {
                severity: "info", detail: { error: e instanceof Error ? e.message : String(e) },
              }));
            }
          }
          // Outro resolution may differ from body clips: re-encode pass keeps
          // concat valid (same vf chain as the light normalize above).
          const outroNorm = join(work, "outro_norm.mp4");
          await this.run(["-i", card, "-vf", `scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,fps=${lightFps()},format=yuv420p`, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-an", outroNorm]);
          clips.push(outroNorm);
          console.log(`[render] appended branded outro`);
        } catch (e) {
          console.warn(`[render] brand outro skipped:`, e instanceof Error ? e.message : e);
          gaps.push(degradation("BRAND_OUTRO_SKIPPED", "film", "The brand outro could not be added to this film.", {
            detail: { error: e instanceof Error ? e.message : String(e) },
          }));
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
      //    from the first scene that has one (single bed for now). A film whose
      //    tracks exist but cannot be mixed FAILS (AUDIO_MIX_FAILED): shipping
      //    it silent would be a fake completion (DirectorOS DOS-74/75).
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
        // Scene tracks may differ in format (Voice Engine WAV, older MP3), so
        // they are decoded and joined by the concat filter, not the demuxer.
        const ext = (k: string) => (/\.(wav|mp3|m4a|aac|ogg|flac)$/i.exec(k)?.[1] ?? "audio").toLowerCase();
        if (voiceScenes.length === 1) {
          voice = await dl(voiceScenes[0]!.voiceKey!, `voice_0.${ext(voiceScenes[0]!.voiceKey!)}`);
        } else if (voiceScenes.length > 1) {
          const parts: string[] = [];
          for (const s of voiceScenes) parts.push(await dl(s.voiceKey!, `voice_${s.index}.${ext(s.voiceKey!)}`));
          voice = join(work, "voice_all.m4a");
          console.log(`[render] narration bed: ${parts.length} scene tracks`);
          await this.run(concatAudioArgs(parts, voice));
        }
        // Narration is never cut to fit the picture (docs/38 §AW.2, regression
        // test 1): measure both, then fit explicitly. A real overrun fails the
        // render (default) or, by explicit policy, holds the last frame.
        let videoForMux = body;
        let outputSec: number | undefined;
        if (voice) {
          const fit = planNarrationFit({
            pictureSec: await this.probe(body),
            narrationSec: await this.probe(voice),
            toleranceSec: Number(process.env.RENDER_NARRATION_TOLERANCE_SEC ?? 0.5),
            policy: (process.env.RENDER_NARRATION_OVERRUN === "extend" ? "extend" : "fail") as NarrationOverrunPolicy,
          });
          console.log(
            `[render] narration fit: ${fit.action} picture=${fit.pictureSec.toFixed(2)}s narration=${fit.narrationSec.toFixed(2)}s overrun=${fit.overrunSec.toFixed(2)}s`,
          );
          if (fit.action === "fail") throw new NarrationOverrunError(fit);
          if (fit.padSec > 0) {
            videoForMux = join(work, "body_extended.mp4");
            await this.run(extendVideoArgs(body, videoForMux, fit.padSec));
          }
          outputSec = fit.outputSec;
        }
        const musicKey = scenes.find((s) => s.musicKey)?.musicKey;
        const music = musicKey ? await dl(musicKey, "music.mp3") : undefined;
        const mixSpec = opts.mix ?? MIX_SPECS.cinematic;
        // Sound design (W16): each scene's ambience under its own span, each
        // effect where its shot lands in the cut — built as two placed stems.
        let ambience: string | undefined;
        let sfx: string | undefined;
        if (placeSounds) {
          const spans = sceneSpans(scenes.length, clipScene, clipSec);
          const totalSec = Math.max(outputSec ?? 0, spans.reduce((a, sp) => Math.max(a, sp.startSec + sp.durSec), 0));
          const files = new Map<string, string>();
          const fetchSound = async (k: string) => {
            if (!files.has(k)) files.set(k, await dl(k, `sound_${files.size}.audio`));
            return files.get(k)!;
          };
          const beds: PlacedSound[] = [];
          const cues: PlacedSound[] = [];
          for (const [si, sc] of scenes.entries()) {
            const span = spans[si]!;
            if (span.durSec <= 0) continue;
            for (const snd of sc.sounds ?? []) {
              const path = await fetchSound(snd.key);
              if (snd.kind === "AMBIENCE") beds.push({ path, startSec: span.startSec, loopSec: span.durSec, fadeSec: mixSpec.ambienceFadeSec });
              else cues.push({ path, startSec: span.startSec + placeCue(snd.startMs / 1000, (snd.plannedSceneMs ?? span.durSec * 1000) / 1000, span.durSec, snd.durationMs / 1000) });
            }
          }
          if (beds.length) {
            ambience = join(work, "ambience_stem.wav");
            await this.run(soundStemArgs(beds, mixSpec.ambienceDb, totalSec, ambience));
          }
          if (cues.length) {
            sfx = join(work, "sfx_stem.wav");
            await this.run(soundStemArgs(cues, mixSpec.sfxDb, totalSec, sfx));
          }
          console.log(`[render] sound design: ${beds.length} ambience bed(s), ${cues.length} effect(s)`);
        }
        if (voice || music || ambience || sfx) {
          const mix = join(work, "mix.m4a");
          await this.run(audioMixArgs({ music, voice, ambience, sfx }, mix, { musicLoopSec: Math.max(opts.filmSec ?? 0, outputSec ?? 0) || undefined, mix: mixSpec, delivery: opts.delivery }));
          const muxed = join(work, "muxed.mp4");
          console.log(`[render] mux audio (voice=${!!voice} music=${!!music} ambience=${!!ambience} sfx=${!!sfx})`);
          // Length = picture (or picture held to the narration's end): only a
          // music/SFX tail beyond it is trimmed, never narration.
          await this.run(muxArgs(videoForMux, mix, muxed, { durationSec: outputSec ?? (await this.probe(videoForMux)) }));
          finalVideo = muxed;
        }
      } catch (e) {
        // A timeline mismatch is a production outcome, not an optional-audio
        // hiccup: never "fix" it by shipping the film without its narration.
        if (e instanceof NarrationOverrunError) throw e;
        throw new ProductionFailure("AUDIO_MIX_FAILED", `the film's sound could not be mixed (${e instanceof Error ? e.message : String(e)})`);
      }
      onProgress?.(0.8);

      // 4) Final MP4 + poster.
      const finalMp4 = join(work, "final.mp4");
      await this.run(["-i", finalVideo, "-c", "copy", "-movflags", "+faststart", finalMp4]);
      const poster = join(work, "poster.jpg");
      await this.run(["-i", finalMp4, "-frames:v", "1", "-q:v", "2", poster]);

      // 4b) Final Quality Gate (W5): the master is measured before it is
      //     delivered; a blocking result stops the render here.
      const hasSound = scenes.some((sc) => Boolean(sc.musicKey || sc.voiceKey || sc.sounds?.length));
      const quality = opts.gate ? await opts.gate(finalMp4, { hasSound, filmSec: opts.filmSec }) : [];
      const blocking = quality.filter((r) => r.outcome === "fail");
      if (blocking.length) {
        throw new ProductionFailure("QUALITY_GATE_FAILED",
          `the finished film failed its quality gate (${blocking.map((r) => `${r.gate}: ${r.findings.map((f) => f.code).join(", ")}`).join("; ")})`,
          { quality });
      }

      // 5) Upload the MP4 + poster (the deliverable). A versioned master gets
      //    its own prefix, so a re-render never overwrites an earlier film (W8).
      const filmDir = opts.dir ?? (opts.version ? `projects/${projectId}/film/v${opts.version}` : `projects/${projectId}/film`);
      const mp4Key = `${filmDir}/final.mp4`;
      const posterKey = `${filmDir}/poster.jpg`;
      const sha256 = await sha256File(finalMp4);
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
        const hlsPrefix = `${filmDir}/hls`;
        await this.storage.uploadDir(hlsDir, hlsPrefix);
        hlsKey = `${hlsPrefix}/master.m3u8`;
      }
      onProgress?.(1);

      return { mp4Key, posterKey, hlsKey, sha256, degradations: gaps, quality };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
}

/**
 * An editor's cut (W13): trim the clip to `cutSec` from its start (an output
 * duration placed before the output file). A clip already shorter is unchanged.
 */
export function withCut(args: string[], cutSec: number | null): string[] {
  if (cutSec == null || !(cutSec > 0)) return args;
  return [...args.slice(0, -1), "-t", cutSec.toFixed(3), args[args.length - 1]!];
}

/** Each scene's span in the cut (seconds), from its clips' measured lengths. */
export function sceneSpans(sceneCount: number, clipScene: number[], clipSec: number[]): { startSec: number; durSec: number }[] {
  const dur = Array.from({ length: sceneCount }, () => 0);
  clipScene.forEach((si, i) => { dur[si]! += clipSec[i] ?? 0; });
  let t = 0;
  return dur.map((d) => { const span = { startSec: t, durSec: d }; t += d; return span; });
}
