import { describe, expect, it } from "vitest";
import { ENGINE_REGISTRY, routeVoice } from "./router";
import { licenceStatus, parseApprovals, VOICE_LICENCES, type VoiceLicence } from "./licences";

const env = { FAL_KEY: "k", OPENAI_API_KEY: "k" };

describe("voice model licence registry (Part 3 §114; Part 4 §139, §141)", () => {
  it("every engine the router knows has an entry", () => {
    for (const id of Object.keys(ENGINE_REGISTRY)) expect(VOICE_LICENCES.some((l) => l.modelId === id), id).toBe(true);
  });

  it("the cloud engines in use today are cleared under their provider's terms", () => {
    expect(licenceStatus("fal-minimax")).toMatchObject({ cleared: true, reasons: [] });
    expect(licenceStatus("openai-tts").cleared).toBe(true);
    expect(routeVoice({ cloning: true, language: "en" }, env).engine?.id).toBe("fal-minimax");
  });

  it("Fish Speech is research-only and never speaks", () => {
    const s = licenceStatus("fish-speech", { VOICE_MODEL_APPROVALS: "fish-speech@v1=owner:2026-10-09" });
    expect(s.cleared).toBe(false);
    expect(s.reasons[0]).toMatch(/research-only/);
  });

  it("a self-hosted model needs its checkpoint, training data and dependencies checked, and the owner's approval", () => {
    const s = licenceStatus("qwen3-tts");
    expect(s.cleared).toBe(false);
    expect(s.reasons).toEqual([
      "exact checkpoint and its licence not checked (§141.1)",
      "training-data terms not checked (§141.1)",
      "dependency licences not checked (§141.1)",
      "no owner approval (§130.2)",
    ]);
    const checked: VoiceLicence[] = VOICE_LICENCES.map((l) => l.modelId === "qwen3-tts"
      ? { ...l, checkpoint: { id: "Qwen3-TTS-1.7B", licence: "Apache-2.0", state: "verified" }, trainingData: "verified", dependencies: "verified" }
      : l);
    expect(licenceStatus("qwen3-tts", {}, checked).reasons).toEqual(["no owner approval (§130.2)"]);
    expect(licenceStatus("qwen3-tts", { VOICE_MODEL_APPROVALS: "qwen3-tts@Qwen3-TTS-0.6B=owner:2026-10-09" }, checked).reasons)
      .toEqual(["owner approval is for checkpoint Qwen3-TTS-0.6B, not Qwen3-TTS-1.7B"]);
    expect(licenceStatus("qwen3-tts", { VOICE_MODEL_APPROVALS: "qwen3-tts@Qwen3-TTS-1.7B=owner:2026-10-09" }, checked))
      .toMatchObject({ cleared: true, approval: { checkpoint: "Qwen3-TTS-1.7B", by: "owner", on: "2026-10-09" } });
  });

  it("an unknown model, an unreadable approval, an unknown licence: refused with the reason", () => {
    expect(licenceStatus("whisper-voice").reasons).toEqual(["no licence registry entry"]);
    expect(licenceStatus("cosyvoice-3").reasons[0]).toBe("commercial use not established");
    expect(() => parseApprovals("qwen3-tts=owner")).toThrow(/expected model@checkpoint/);
    expect(licenceStatus("qwen3-tts", { VOICE_MODEL_APPROVALS: "garbage" }).reasons).toContain("no owner approval (§130.2)");
  });

  it("the router says why a model was passed over — Phase 1 gate first, licence never bypassed", () => {
    const r = routeVoice({ cloning: true, language: "en" }, { ...env, VOICE_ENGINES: "qwen3-tts:100,fal-minimax:90", VOICE_GPU_URL: "http://gpu" });
    expect(r.engine?.id).toBe("fal-minimax");
    expect(r.passedOver[0]!.reason).toMatch(/Phase 1/);
  });
});
