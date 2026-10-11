"""GPT-SoVITS (v2Pro) — few-second voice cloning (Part 4 §134).

Runtime: the RVC-Boss/GPT-SoVITS repository (MIT) checked out at a pinned
commit in the image (GPTSOVITS_HOME); its inference class
`TTS_infer_pack.TTS.TTS`. Checkpoint repository: VOICE_MODEL_REPO (default
lj1995/GPT-SoVITS) at VOICE_MODEL_REVISION — only the files v2Pro needs are
downloaded: the GPT (s1v3.ckpt) and SoVITS (v2Pro/s2Gv2Pro.pth) weights, the
speaker-verification model (sv/), chinese-hubert-base and
chinese-roberta-wwm-ext-large.

Artifact (`prompt_audio`): a 3–10 s excerpt of the reference recording (the
model's own limit) as 16-bit WAV, with its transcript and language in the
artifact metadata (CineForge stores it in voice_engine_artifacts). GPT-SoVITS
conditions on that clip at every call; zero-shot only — per-voice fine-tuning
(adapter weights) is not run here.

Languages: English, Japanese, Korean. Chinese/Cantonese need the G2PW model,
which this image does not download.

Licence caveat (docs/74): chinese-hubert-base was pretrained on WenetSpeech,
which is distributed for non-commercial purposes only. The CineForge licence
registry records this as a restriction that blocks production use until a
legal review is recorded.
"""

from __future__ import annotations

import os
import shutil
import sys

from .base import EngineError, EngineInfo, Style, VoiceBackend

ALLOW = ["chinese-hubert-base/*", "chinese-roberta-wwm-ext-large/*", "s1v3.ckpt", "v2Pro/s2Gv2Pro.pth", "sv/*"]

INFO = EngineInfo(
    id="gpt-sovits",
    name="GPT-SoVITS v2Pro",
    languages={"en": "en", "ja": "all_ja", "ko": "all_ko"},
    max_chars=400,
    artifact_type="prompt_audio",
    artifact_ext="wav",
    artifact_content_type="audio/wav",
    sample_rate=32000,
    speed_control=True,
    similarity=False,
    default_repo="lj1995/GPT-SoVITS",
    min_reference_sec=3.0,
    max_reference_sec=9.5,
    transcript_note="with a transcript: prompted clone; without: reference-free mode (lower quality)",
)


class GptSovitsBackend(VoiceBackend):
    info = INFO
    runtime_package = "gpt-sovits"

    def __init__(self, env=None) -> None:
        super().__init__(env)
        self.home = self.env.get("GPTSOVITS_HOME", "/opt/GPT-SoVITS")
        self.tts = None

    def _load_real(self) -> None:
        snap = self.snapshot(allow_patterns=ALLOW)
        # GPT-SoVITS resolves several paths relative to its checkout (e.g. the
        # speaker-verification model); run from there, with the snapshot linked in.
        os.chdir(self.home)
        for p in (self.home, os.path.join(self.home, "GPT_SoVITS")):
            if p not in sys.path:
                sys.path.insert(0, p)
        sv_link = os.path.join(self.home, "GPT_SoVITS", "pretrained_models", "sv")
        if not os.path.exists(sv_link):
            os.makedirs(os.path.dirname(sv_link), exist_ok=True)
            os.symlink(os.path.join(snap, "sv"), sv_link)
        from TTS_infer_pack.TTS import TTS, TTS_Config  # noqa: PLC0415

        cfg = TTS_Config({"custom": {
            "device": "cuda", "is_half": True, "version": "v2Pro",
            "t2s_weights_path": os.path.join(snap, "s1v3.ckpt"),
            "vits_weights_path": os.path.join(snap, "v2Pro", "s2Gv2Pro.pth"),
            "bert_base_path": os.path.join(snap, "chinese-roberta-wwm-ext-large"),
            "cnhuhbert_base_path": os.path.join(snap, "chinese-hubert-base"),
        }})
        self.tts = TTS(cfg)

    def _enroll_real(self, reference_path, reference_text, language, out_path) -> dict:
        wav, text, dur = self.reference(reference_path, reference_text)
        shutil.move(wav, out_path)
        # The transcript and language travel in the artifact metadata (CineForge stores them).
        return {"mode": "prompted" if text else "reference_free", "transcriptUsed": text is not None,
                "referenceSec": round(dur, 3), "promptText": text or "", "promptLang": language}

    def _prepare_real(self, artifact_path, artifact_sha256, metadata):
        return {"path": artifact_path, "meta": metadata}

    def _synthesize_real(self, voice, texts, language, style: Style, out_paths) -> None:
        import numpy as np  # noqa: PLC0415

        from ..wavio import write_pcm16  # noqa: PLC0415

        meta = voice.get("meta") or {}
        for text, path in zip(texts, out_paths):
            chunks, rate = [], None
            for sr, audio in self.tts.run({
                "text": text, "text_lang": language,
                "ref_audio_path": voice["path"],
                "prompt_text": meta.get("promptText", ""), "prompt_lang": meta.get("promptLang", language),
                "text_split_method": "cut5", "batch_size": 1,
                "speed_factor": float(style.speed) if style.speed is not None else 1.0,
                "return_fragment": False, "parallel_infer": True,
            }):
                rate = sr
                chunks.append(np.asarray(audio))
            if not chunks:
                raise EngineError("NO_AUDIO", "the model produced no speech")
            pcm = np.concatenate(chunks).astype("float32")
            if np.abs(pcm).max() > 1.5:  # int16 range → [-1, 1]
                pcm = pcm / 32768.0
            write_pcm16(path, pcm, int(rate))
