import { describe, expect, it } from "vitest";
import { ENGINE_REGISTRY, routeVoice } from "./router";
import { evaluationAllowed, licenceStatus, parseApprovals, VOICE_LICENCES, type VoiceLicence } from "./licences";

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
    expect(s.reasons[0]).toMatch(/^blocked: Fish Audio Research License/);
    expect(s.reasons[1]).toMatch(/research-only/);
  });

  it("a self-hosted model needs its checkpoint, training data and dependencies checked, and the owner's approval", () => {
    const unchecked: VoiceLicence[] = VOICE_LICENCES.map((l) => l.modelId === "qwen3-tts"
      ? { ...l, checkpoint: { id: "Qwen3-TTS-1.7B", licence: null, state: "unverified" }, trainingData: "unverified", dependencies: "unverified" }
      : l);
    expect(licenceStatus("qwen3-tts", {}, unchecked).reasons).toEqual([
      "exact checkpoint and its licence not checked (§141.1)",
      "training-data terms not checked (§141.1)",
      "dependency licences not checked (§141.1)",
      "no owner approval (§130.2)",
    ]);
    // An approval never clears what nobody checked.
    expect(licenceStatus("qwen3-tts", { VOICE_MODEL_APPROVALS: "qwen3-tts@Qwen3-TTS-1.7B=owner:2026-10-09" }, unchecked).cleared).toBe(false);
    const checked: VoiceLicence[] = VOICE_LICENCES.map((l) => l.modelId === "qwen3-tts"
      ? { ...l, checkpoint: { id: "Qwen3-TTS-1.7B", licence: "Apache-2.0", state: "verified" }, trainingData: "verified", dependencies: "verified" }
      : l);
    expect(licenceStatus("qwen3-tts", {}, checked).reasons).toEqual(["no owner approval (§130.2)"]);
    expect(licenceStatus("qwen3-tts", { VOICE_MODEL_APPROVALS: "qwen3-tts@Qwen3-TTS-0.6B=owner:2026-10-09" }, checked).reasons)
      .toEqual(["owner approval is for checkpoint Qwen3-TTS-0.6B, not Qwen3-TTS-1.7B"]);
    expect(licenceStatus("qwen3-tts", { VOICE_MODEL_APPROVALS: "qwen3-tts@Qwen3-TTS-1.7B=owner:2026-10-09" }, checked))
      .toMatchObject({ cleared: true, approval: { checkpoint: "Qwen3-TTS-1.7B", by: "owner", on: "2026-10-09" } });
  });

  it("the three self-hosted engines carry the facts checked on 2026-10-11, with sources", () => {
    for (const id of ["qwen3-tts", "cosyvoice-3", "gpt-sovits"]) {
      const l = VOICE_LICENCES.find((x) => x.modelId === id)!;
      expect(l.checkedAt).toBe("2026-10-11");
      expect(l.commercialUse).toBe("allowed");
      expect(l.dependencies).toBe("verified");
      expect(l.checkpoint.id).toBeTruthy();
      expect(l.sources!.length).toBeGreaterThan(1);
      expect(l.sources!.every((s) => s.url.startsWith("https://"))).toBe(true);
      expect(l.blocked).toBeUndefined();
    }
    expect(VOICE_LICENCES.find((l) => l.modelId === "qwen3-tts")!.codeLicence).toBe("Apache-2.0");
    expect(VOICE_LICENCES.find((l) => l.modelId === "cosyvoice-3")!.codeLicence).toBe("Apache-2.0");
    expect(VOICE_LICENCES.find((l) => l.modelId === "gpt-sovits")!.codeLicence).toBe("MIT");
  });

  it("none is approved by default — only the owner's approval of the exact checkpoint clears Qwen3-TTS and CosyVoice 3", () => {
    for (const id of ["qwen3-tts", "cosyvoice-3", "gpt-sovits"]) expect(licenceStatus(id, {}).cleared).toBe(false);
    const q = licenceStatus("qwen3-tts", {});
    expect(q.reasons).toEqual([expect.stringMatching(/^no owner approval \(§130\.2\) — approving also records: exact checkpoint and its licence confirmed by the owner at the source; training-data terms not disclosed/)]);
    const ok = licenceStatus("qwen3-tts", { VOICE_MODEL_APPROVALS: "qwen3-tts@Qwen/Qwen3-TTS-12Hz-1.7B-Base=Ada Owner:2026-10-12" });
    expect(ok).toMatchObject({ cleared: true, approval: { by: "Ada Owner", on: "2026-10-12" } });
    expect(ok.confirmedOnApproval).toHaveLength(2);
    expect(licenceStatus("cosyvoice-3", { VOICE_MODEL_APPROVALS: "cosyvoice-3@FunAudioLLM/Fun-CosyVoice3-0.5B-2512=owner:2026-10-12" }).cleared).toBe(true);
    expect(licenceStatus("cosyvoice-3", { VOICE_MODEL_APPROVALS: "cosyvoice-3@FunAudioLLM/CosyVoice2-0.5B=owner:2026-10-12" }).reasons)
      .toContain("owner approval is for checkpoint FunAudioLLM/CosyVoice2-0.5B, not FunAudioLLM/Fun-CosyVoice3-0.5B-2512");
  });

  it("GPT-SoVITS's training-data restriction is not cleared by an approval; it may only be evaluated", () => {
    const s = licenceStatus("gpt-sovits", { VOICE_MODEL_APPROVALS: "gpt-sovits@lj1995/GPT-SoVITS=owner:2026-10-12" });
    expect(s.cleared).toBe(false);
    expect(s.reasons).toEqual(["training-data terms: restricted — needs a legal review recorded in the licence registry (§141.1)"]);
    expect(VOICE_LICENCES.find((l) => l.modelId === "gpt-sovits")!.restrictions!.join(" ")).toMatch(/WenetSpeech/);
    expect(evaluationAllowed("gpt-sovits")).toEqual({ allowed: true, reason: null });
  });

  it("a licence that forbids commercial use is blocked, never evaluated, whatever the approvals say", () => {
    for (const id of ["fish-speech", "f5-tts"]) {
      const s = licenceStatus(id, { VOICE_MODEL_APPROVALS: `${id}@x=owner:2026-10-12` });
      expect(s.cleared).toBe(false);
      expect(s.reasons[0]).toMatch(/^blocked: /);
      expect(evaluationAllowed(id).allowed).toBe(false);
    }
    expect(evaluationAllowed("qwen3-tts").allowed).toBe(true);
    expect(evaluationAllowed("nope").allowed).toBe(false);
  });

  it("an unknown model, an unreadable approval, an unknown licence: refused with the reason", () => {
    expect(licenceStatus("whisper-voice").reasons).toEqual(["no licence registry entry"]);
    const unknown = VOICE_LICENCES.map((l) => (l.modelId === "cosyvoice-3" ? { ...l, commercialUse: "unknown" as const } : l));
    expect(licenceStatus("cosyvoice-3", {}, unknown).reasons[0]).toBe("commercial use not established");
    expect(() => parseApprovals("qwen3-tts=owner")).toThrow(/expected model@checkpoint/);
    expect(licenceStatus("qwen3-tts", { VOICE_MODEL_APPROVALS: "garbage" }).reasons).toContainEqual(expect.stringMatching(/^no owner approval \(§130\.2\)/));
  });

  it("the router says why a model was passed over — the licence is never bypassed", () => {
    const r = routeVoice({ cloning: true, language: "en" }, { ...env, VOICE_ENGINES: "qwen3-tts:100,fal-minimax:90", VOICE_GPU_QWEN3_URL: "http://gpu", VOICE_GPU_QWEN3_REVISION: "a".repeat(40) });
    expect(r.engine?.id).toBe("fal-minimax");
    expect(r.passedOver[0]!.reason).toMatch(/^licence: no owner approval/);
  });
});
