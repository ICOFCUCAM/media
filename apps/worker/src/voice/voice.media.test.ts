/** W7 proof with real FFmpeg (CI job media-regression): recordings are measured and judged, speech is mastered to spec. */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { judgeVoiceSample } from "@cineforge/voice-contracts";
import { analyzeVoiceSample } from "./analyze";
import { joinSegments, masterSegment, measureSpeech, SEGMENT_GAP_MS } from "./mastering";
import { concatAudioArgs } from "../ffmpeg/commands";

const HAVE_FFMPEG = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;
if (process.env.REQUIRE_FFMPEG === "1" && !HAVE_FFMPEG) throw new Error("ffmpeg/ffprobe required for the media regression tests");

let dir = "";
const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
// "Speech" (lavfi sine is at 1/8 full scale): a tone switched on and off (syllables and pauses) over a quiet room.
const talk = (sec: number, rate: number, vol: string) =>
  ["-f", "lavfi", "-i", `sine=frequency=220:sample_rate=${rate}:duration=${sec}`, "-f", "lavfi", "-i", `anoisesrc=color=pink:amplitude=0.0005:sample_rate=${rate}:duration=${sec}`,
   "-filter_complex", `[0]volume='if(lt(mod(t,1),0.7),${vol},0)':eval=frame[s];[s][1]amix=inputs=2:normalize=0`, "-ac", "1"];

describe.runIf(HAVE_FFMPEG)("voice recordings and mastering on real media", () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "cf-voice-media-"));
    ff([...talk(20, 48000, "0.3"), join(dir, "good.wav")]);
    ff([...talk(3, 48000, "0.3"), join(dir, "short.wav")]);
    ff([...talk(20, 48000, "24"), join(dir, "clipped.wav")]);
    ff([...talk(20, 8000, "0.3"), join(dir, "phone.wav")]);
    // Raw engine output: quiet, with silence before and after, as mp3 at 24 kHz.
    ff(["-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=24000:duration=3",
        "-filter_complex", "[0]atrim=0:0.6[a];[1]volume=0.05[b];[0]atrim=0:0.8[c];[a][b][c]concat=n=3:v=0:a=1", "-c:a", "libmp3lame", join(dir, "raw.mp3")]);
  }, 60_000);
  afterAll(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it("a clean 20 s recording is good", async () => {
    const r = judgeVoiceSample(await analyzeVoiceSample(join(dir, "good.wav")));
    expect(r).toMatchObject({ quality: "good", sample_rate: 48000, channels: 1, clipping: false });
    expect(r.speech_ratio).toBeGreaterThan(0.6);
  });

  it("short, clipped and telephone-rate recordings are refused with reasons", async () => {
    const short = judgeVoiceSample(await analyzeVoiceSample(join(dir, "short.wav")));
    const clipped = judgeVoiceSample(await analyzeVoiceSample(join(dir, "clipped.wav")));
    const phone = judgeVoiceSample(await analyzeVoiceSample(join(dir, "phone.wav")));
    expect(short.quality).toBe("poor");
    expect(short.issues.join(" ")).toMatch(/at least 10 seconds/);
    expect(clipped).toMatchObject({ quality: "poor", clipping: true });
    expect(phone.quality).toBe("poor");
    expect(phone.issues.join(" ")).toMatch(/8000 Hz/);
  });

  it("masters engine output to 48 kHz mono, -16 LUFS, under -1 dBTP, silence trimmed", async () => {
    const out = join(dir, "mastered.wav");
    await masterSegment(join(dir, "raw.mp3"), out);
    const m = await measureSpeech(out);
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=sample_rate,channels,codec_name", "-of", "json", out]).toString());
    expect(probe.streams[0]).toMatchObject({ sample_rate: "48000", channels: 1, codec_name: "pcm_s16le" });
    expect(m.integratedLufs!).toBeGreaterThan(-18);
    expect(m.integratedLufs!).toBeLessThan(-14);
    expect(m.truePeakDbtp!).toBeLessThanOrEqual(-1);
    expect(m.durationSec).toBeGreaterThan(2.7);
    expect(m.durationSec).toBeLessThan(3.3); // 1.4 s of leading/trailing silence removed
  }, 30_000);

  it("joins mastered segments with the fixed pause", async () => {
    const a = join(dir, "mastered.wav");
    const out = join(dir, "joined.wav");
    await joinSegments([a, a, a], out, dir);
    const one = (await measureSpeech(a)).durationSec;
    const all = (await measureSpeech(out)).durationSec;
    expect(all).toBeCloseTo(one * 3 + (2 * SEGMENT_GAP_MS) / 1000, 1);
  }, 30_000);

  it("the film's voice bed joins Voice Engine WAV and older MP3 scene tracks", async () => {
    const wav = join(dir, "mastered.wav");
    const mp3 = join(dir, "raw.mp3");
    const out = join(dir, "bed.m4a");
    ff(concatAudioArgs([wav, mp3, wav], out));
    const total = (await measureSpeech(out)).durationSec;
    const expected = 2 * (await measureSpeech(wav)).durationSec + (await measureSpeech(mp3)).durationSec;
    expect(total).toBeCloseTo(expected, 0);
  }, 30_000);
});
