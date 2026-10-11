"""CosyVoice 3 (Fun-CosyVoice3-0.5B) — zero-shot voice cloning (Part 4 §132).

Runtime: the FunAudioLLM/CosyVoice repository (Apache-2.0) checked out at a
pinned commit in the image (COSYVOICE_HOME, with its Matcha-TTS submodule).
Checkpoint: VOICE_MODEL_REPO (default FunAudioLLM/Fun-CosyVoice3-0.5B-2512) at
VOICE_MODEL_REVISION.

Artifact (`speaker_embedding`): the frontend's zero-shot speaker features —
CAM++ speaker embedding, prompt speech tokens and features, prompt text tokens
— exactly what `add_zero_shot_spk` caches, as safetensors (no pickle). With a
transcript the voice is spoken in zero-shot mode; without one in cross-lingual
mode (speaker features only). The speech tokenizer takes at most 30 s, so the
reference is limited to 25 s.

Speed is supported (`speed=`); instruction-driven emotion is not wired yet.
"""

from __future__ import annotations

import os
import sys

from .base import EngineError, EngineInfo, Style, VoiceBackend

ARTIFACT_FORMAT = "cineforge.cosyvoice-3.zero-shot-spk/1"
# Fun-CosyVoice3 expects this system prompt before <|endofprompt|> (upstream example.py).
PROMPT_PREFIX = "You are a helpful assistant.<|endofprompt|>"

INFO = EngineInfo(
    id="cosyvoice-3",
    name="CosyVoice 3",
    languages={code: code for code in ("zh", "en", "ja", "ko", "de", "es", "fr", "it", "ru")},
    max_chars=600,
    artifact_type="speaker_embedding",
    artifact_ext="safetensors",
    artifact_content_type="application/octet-stream",
    sample_rate=24000,
    speed_control=True,
    similarity=True,
    default_repo="FunAudioLLM/Fun-CosyVoice3-0.5B-2512",
    min_reference_sec=3.0,
    max_reference_sec=25.0,
    transcript_note="with a transcript: zero-shot clone; without: cross-lingual clone from speaker features",
)


class CosyVoiceBackend(VoiceBackend):
    info = INFO
    runtime_package = "cosyvoice"

    def __init__(self, env=None) -> None:
        super().__init__(env)
        self.home = self.env.get("COSYVOICE_HOME", "/opt/CosyVoice")
        self.model = None

    def _load_real(self) -> None:
        for p in (self.home, os.path.join(self.home, "third_party", "Matcha-TTS")):
            if p not in sys.path:
                sys.path.insert(0, p)
        from cosyvoice.cli.cosyvoice import AutoModel  # noqa: PLC0415

        self.model = AutoModel(model_dir=self.snapshot())

    def _enroll_real(self, reference_path, reference_text, language, out_path) -> dict:
        from safetensors.torch import save_file  # noqa: PLC0415

        wav, text, dur = self.reference(reference_path, reference_text)
        try:
            feats = self.model.frontend.frontend_zero_shot("", PROMPT_PREFIX + (text or ""), wav, self.model.sample_rate, "")
        finally:
            os.unlink(wav)
        feats.pop("text", None)
        feats.pop("text_len", None)
        tensors = {k: v.detach().to("cpu").contiguous() for k, v in feats.items()}
        mode = "zero_shot" if text else "cross_lingual"
        save_file(tensors, out_path, metadata={"format": ARTIFACT_FORMAT, "mode": mode})
        return {"mode": mode, "transcriptUsed": text is not None, "referenceSec": round(dur, 3), "format": ARTIFACT_FORMAT}

    def _prepare_real(self, artifact_path, artifact_sha256, metadata):
        from safetensors import safe_open  # noqa: PLC0415
        from safetensors.torch import load_file  # noqa: PLC0415

        with safe_open(artifact_path, framework="pt") as f:
            meta = f.metadata() or {}
        if meta.get("format") != ARTIFACT_FORMAT:
            raise EngineError("ARTIFACT_FORMAT", f"expected {ARTIFACT_FORMAT}, got {meta.get('format')!r}")
        device = getattr(self.model.frontend, "device", "cuda")
        spk_id = f"cf-{artifact_sha256[:24]}"
        self.model.frontend.spk2info[spk_id] = load_file(artifact_path, device=str(device))
        return {"spk": spk_id, "mode": meta.get("mode", "cross_lingual")}

    def release_voice(self, prepared) -> None:
        if self.model is not None and isinstance(prepared, dict) and prepared.get("spk"):
            self.model.frontend.spk2info.pop(prepared["spk"], None)

    def _synthesize_real(self, voice, texts, language, style: Style, out_paths) -> None:
        import torch  # noqa: PLC0415

        from ..wavio import write_pcm16  # noqa: PLC0415

        speed = float(style.speed) if style.speed is not None else 1.0
        for text, path in zip(texts, out_paths):
            if voice["mode"] == "zero_shot":
                gen = self.model.inference_zero_shot(text, "", "", zero_shot_spk_id=voice["spk"], stream=False, speed=speed)
            else:
                gen = self.model.inference_cross_lingual(PROMPT_PREFIX + text, "", zero_shot_spk_id=voice["spk"],
                                                         stream=False, speed=speed)
            parts = [out["tts_speech"] for out in gen]
            if not parts:
                raise EngineError("NO_AUDIO", "the model produced no speech")
            write_pcm16(path, torch.cat(parts, dim=1).squeeze(0).float().cpu().numpy(), self.model.sample_rate)

    def _embed_real(self, wav_path) -> list[float]:
        emb = self.model.frontend._extract_spk_embedding(wav_path)  # CAM++ speaker embedding
        return [float(x) for x in emb.float().reshape(-1).cpu().tolist()]
