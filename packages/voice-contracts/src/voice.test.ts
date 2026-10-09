import { describe, expect, it } from "vitest";
import { BatchSpeechBody, EnrollVoiceBody, SpeechBody, canTransition, judgeVoiceSample, routeVoice, segmentScript } from "./index";

describe("job states (§164)", () => {
  it("only moves forward along the pipeline; terminal states stay terminal", () => {
    expect(canTransition("queued", "claimed")).toBe(true);
    expect(canTransition("generating", "post_processing")).toBe(true);
    expect(canTransition("post_processing", "completed")).toBe(true);
    expect(canTransition("queued", "completed")).toBe(false);
    expect(canTransition("completed", "failed")).toBe(false);
    expect(canTransition("post_processing", "cancelled")).toBe(false);
  });
});

describe("API bodies (§159, §162)", () => {
  it("enrollment requires confirmed consent", () => {
    const ok = { name: "James Voice", language: "en", reference_audio_key: "voices/u/a.wav", consent: { confirmed: true, type: "self" } };
    expect(EnrollVoiceBody.safeParse(ok).success).toBe(true);
    expect(EnrollVoiceBody.safeParse({ ...ok, consent: { confirmed: false, type: "self" } }).success).toBe(false);
    expect(EnrollVoiceBody.safeParse({ ...ok, consent: undefined }).success).toBe(false);
  });
  it("speech defaults to 48 kHz mono WAV and English; style is bounded", () => {
    const s = SpeechBody.parse({ text: "Welcome." });
    expect(s).toMatchObject({ language: "en", output: { format: "wav", sample_rate: 48000, channels: 1 } });
    expect(SpeechBody.safeParse({ text: "x", style: { speed: 5 } }).success).toBe(false);
    expect(BatchSpeechBody.safeParse({ items: [] }).success).toBe(false);
  });
});

describe("long scripts (§165)", () => {
  it("splits paragraphs and sentences into bounded, ordered segments", () => {
    const text = "This is the first sentence. This is the second one!\n\nA new paragraph starts here? Yes.";
    const segs = segmentScript(text, 60);
    expect(segs.map((s) => s.text)).toEqual(["This is the first sentence. This is the second one!", "A new paragraph starts here? Yes."]);
    expect(segs.map((s) => s.segmentId)).toEqual(["seg_001", "seg_002"]);
    const long = segmentScript(`${"word ".repeat(300)}end.`, 100);
    expect(long.every((s) => s.text.length <= 100)).toBe(true);
    expect(long.map((s) => s.text).join(" ").replace(/\s+/g, " ")).toBe(`${"word ".repeat(300)}end.`.replace(/\s+/g, " ").trim());
  });
});

describe("reference recording quality (§160)", () => {
  const good = { durationSec: 42.7, sampleRate: 48000, channels: 1, silenceRatio: 0.09, peakDbfs: -3, noiseFloorDbfs: -62 };
  it("a clean 40 s recording is good", () => {
    expect(judgeVoiceSample(good)).toMatchObject({ quality: "good", issues: [], speech_ratio: 0.91, clipping: false });
  });
  it("noise, clipping, silence and short recordings are poor, with the reason", () => {
    const r = judgeVoiceSample({ ...good, peakDbfs: 0, noiseFloorDbfs: -30 });
    expect(r.quality).toBe("poor");
    expect(r.issues).toEqual(["There is significant clipping — record a little quieter.", "Background noise is high."]);
    expect(judgeVoiceSample({ ...good, durationSec: 3 }).quality).toBe("poor");
    expect(judgeVoiceSample({ ...good, silenceRatio: 0.7 }).quality).toBe("poor");
    expect(judgeVoiceSample({ ...good, durationSec: 8 }).quality).toBe("fair");
  });
});

describe("voice router (§167–168)", () => {
  it("picks by priority among configured engines that can do the job", () => {
    const env = { FAL_KEY: "k", OPENAI_API_KEY: "k" };
    expect(routeVoice({ cloning: true, language: "en" }, env).engine?.id).toBe("fal-minimax");
    expect(routeVoice({ cloning: false, language: "en" }, { ...env, VOICE_ENGINES: "openai-tts:100,fal-minimax:90" }).engine?.id).toBe("openai-tts");
  });
  it("a cloned voice never falls back to a stock narrator", () => {
    const r = routeVoice({ cloning: true, language: "en" }, { OPENAI_API_KEY: "k" });
    expect(r.engine).toBeNull();
    expect(r.passedOver).toEqual([
      { id: "fal-minimax", reason: "not configured (FAL_KEY)" },
      { id: "openai-tts", reason: "cannot speak in a cloned voice" },
    ]);
  });
  it("self-hosted models are listed but gated", () => {
    const r = routeVoice({ cloning: true, language: "en" }, { VOICE_ENGINES: "qwen3-tts:100,fal-minimax:90", FAL_KEY: "k", VOICE_GPU_URL: "http://gpu" });
    expect(r.engine?.id).toBe("fal-minimax");
    expect(r.passedOver[0]).toMatchObject({ id: "qwen3-tts", reason: expect.stringMatching(/Phase 1/) });
  });
});
