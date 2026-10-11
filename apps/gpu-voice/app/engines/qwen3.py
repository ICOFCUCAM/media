"""Qwen3-TTS (Base model) — voice cloning from a reference recording (Part 4 §131).

Runtime: the `qwen-tts` package (Apache-2.0, pinned in requirements-qwen3-tts.txt).
Checkpoint: VOICE_MODEL_REPO (default Qwen/Qwen3-TTS-12Hz-1.7B-Base; the
0.6B Base is the smaller worker, §131.3) at VOICE_MODEL_REVISION. The Base
checkpoint carries its speech tokenizer (`speech_tokenizer/`).

Artifact (`speaker_embedding`): the model's reusable voice-clone prompt
(`create_voice_clone_prompt`) — speaker x-vector, plus the reference speech
codes and transcript in ICL mode — as safetensors (no pickle). With a
transcript the model clones in ICL mode (best quality); without one it uses
the speaker embedding alone (x_vector_only_mode, lower quality). Which mode was
used is recorded in the artifact metadata.

Not used: instruction/emotion control and named speakers belong to the
CustomVoice / VoiceDesign checkpoints, not Base; speed has no parameter.
"""

from __future__ import annotations

import os

from .base import EngineError, EngineInfo, Style, VoiceBackend

ARTIFACT_FORMAT = "cineforge.qwen3-tts.clone-prompt/1"

INFO = EngineInfo(
    id="qwen3-tts",
    name="Qwen3-TTS",
    languages={"zh": "Chinese", "en": "English", "ja": "Japanese", "ko": "Korean", "de": "German",
               "fr": "French", "ru": "Russian", "pt": "Portuguese", "es": "Spanish", "it": "Italian"},
    max_chars=600,
    artifact_type="speaker_embedding",
    artifact_ext="safetensors",
    artifact_content_type="application/octet-stream",
    sample_rate=24000,
    speed_control=False,
    similarity=True,
    default_repo="Qwen/Qwen3-TTS-12Hz-1.7B-Base",
    min_reference_sec=3.0,
    max_reference_sec=30.0,
    transcript_note="with a transcript: ICL clone; without: speaker-embedding-only clone (lower quality)",
)


class Qwen3Backend(VoiceBackend):
    info = INFO
    runtime_package = "qwen-tts"

    def __init__(self, env=None) -> None:
        super().__init__(env)
        self.batch = max(1, int(self.env.get("QWEN3_BATCH", "4")))
        self.attn = self.env.get("QWEN3_ATTN_IMPLEMENTATION", "sdpa")
        self.device = self.env.get("VOICE_DEVICE", "cuda:0")
        self.model = None

    def _load_real(self) -> None:
        import torch  # noqa: PLC0415
        from qwen_tts import Qwen3TTSModel  # noqa: PLC0415

        path = self.snapshot()
        self.model = Qwen3TTSModel.from_pretrained(path, device_map=self.device, dtype=torch.bfloat16,
                                                   attn_implementation=self.attn)

    def _enroll_real(self, reference_path, reference_text, language, out_path) -> dict:
        from safetensors.torch import save_file  # noqa: PLC0415

        wav, text, dur = self.reference(reference_path, reference_text)
        try:
            items = self.model.create_voice_clone_prompt(ref_audio=wav, ref_text=text, x_vector_only_mode=text is None)
        finally:
            os.unlink(wav)
        it = items[0]
        tensors = {"ref_spk_embedding": it.ref_spk_embedding.detach().to("cpu").contiguous()}
        if it.ref_code is not None:
            tensors["ref_code"] = it.ref_code.detach().to("cpu").contiguous()
        save_file(tensors, out_path, metadata={
            "format": ARTIFACT_FORMAT,
            "x_vector_only_mode": "1" if it.x_vector_only_mode else "0",
            "icl_mode": "1" if it.icl_mode else "0",
            "ref_text": it.ref_text or "",
        })
        return {"mode": "icl" if it.icl_mode else "x_vector_only", "transcriptUsed": text is not None,
                "referenceSec": round(dur, 3), "format": ARTIFACT_FORMAT}

    def _prepare_real(self, artifact_path, artifact_sha256):
        from qwen_tts.inference.qwen3_tts_model import VoiceClonePromptItem  # noqa: PLC0415
        from safetensors import safe_open  # noqa: PLC0415
        from safetensors.torch import load_file  # noqa: PLC0415

        with safe_open(artifact_path, framework="pt") as f:
            meta = f.metadata() or {}
        if meta.get("format") != ARTIFACT_FORMAT:
            raise EngineError("ARTIFACT_FORMAT", f"expected {ARTIFACT_FORMAT}, got {meta.get('format')!r}")
        t = load_file(artifact_path, device=self.device)
        return VoiceClonePromptItem(
            ref_code=t.get("ref_code"),
            ref_spk_embedding=t["ref_spk_embedding"],
            x_vector_only_mode=meta.get("x_vector_only_mode") == "1",
            icl_mode=meta.get("icl_mode") == "1",
            ref_text=meta.get("ref_text") or None,
        )

    def _synthesize_real(self, voice, texts, language, style: Style, out_paths) -> None:
        import soundfile as sf  # noqa: PLC0415

        # The model stays loaded; lines are generated in small batches (§155.2).
        for start in range(0, len(texts), self.batch):
            chunk = texts[start:start + self.batch]
            wavs, sr = self.model.generate_voice_clone(
                text=chunk, language=[language] * len(chunk), voice_clone_prompt=[voice] * len(chunk))
            for wav, path in zip(wavs, out_paths[start:start + self.batch]):
                sf.write(path, wav, sr, subtype="PCM_16")

    def _embed_real(self, wav_path) -> list[float]:
        items = self.model.create_voice_clone_prompt(ref_audio=wav_path, x_vector_only_mode=True)
        return [float(x) for x in items[0].ref_spk_embedding.float().reshape(-1).cpu().tolist()]
