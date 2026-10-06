"""
Model loading + inference + S3 upload for the GPU worker.

Runs REAL inference for both models (docs/22):
  - MODEL_NAME=wan-2.1  → Wan 2.1   (primary; default Wan-AI/Wan2.1-T2V-1.3B-Diffusers)
  - MODEL_NAME=hunyuan  → Hunyuan Video (premium; hunyuanvideo-community/HunyuanVideo)

The heavy deps (torch/diffusers) are imported lazily so this module still loads
on a machine without a GPU. When CUDA isn't available (or CINEFORGE_PLACEHOLDER=1)
it falls back to the FFmpeg placeholder, so the pipeline is runnable end-to-end
for testing and the API boots anywhere.

Identity mapping (docs/28): the seed/reference frame drives image-to-video when
an I2V model is configured (WAN_I2V_MODEL_ID); per-character LoRA is loaded +
fused per request. Reference-video (v2v) on these models is a future step.
"""

from __future__ import annotations

import os
import subprocess
import tempfile

S3_BUCKET = os.environ.get("S3_BUCKET", "cineforge-assets")
PLACEHOLDER = os.environ.get("CINEFORGE_PLACEHOLDER") == "1"

# Pinned model ids (override via env). 1.3B is the budget-friendly default.
MODEL_IDS = {
    "wan-2.1": os.environ.get("WAN_MODEL_ID", "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"),
    "hunyuan": os.environ.get("HUNYUAN_MODEL_ID", "hunyuanvideo-community/HunyuanVideo"),
}
# Pinned Hugging Face commit per model (docs/39 F6). The gateway refuses to
# enforce with an unpinned model: an unpinned repo can change weights silently.
MODEL_REVISIONS = {
    "wan-2.1": os.environ.get("WAN_MODEL_REVISION") or None,
    "hunyuan": os.environ.get("HUNYUAN_MODEL_REVISION") or None,
}
# Optional image-to-video model (enables seed-frame conditioning / identity lock).
WAN_I2V_MODEL_ID = os.environ.get("WAN_I2V_MODEL_ID")  # e.g. Wan-AI/Wan2.1-I2V-14B-480P-Diffusers
WAN_I2V_MODEL_REVISION = os.environ.get("WAN_I2V_MODEL_REVISION") or None


def _cuda_available() -> bool:
    try:
        import torch  # noqa: PLC0415

        return bool(torch.cuda.is_available())
    except Exception:
        return False


class VideoPipeline:
    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        self._t2v = None  # text-to-video pipeline
        self._i2v = None  # image-to-video pipeline (lazy)
        self._loaded = False
        self._real = False  # True once real weights are loaded

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def is_real(self) -> bool:
        """True once real weights are loaded (False in placeholder mode)."""
        return self._real

    def has_i2v(self) -> bool:
        """Whether a reference frame switches this worker to image-to-video."""
        return self.model_name == "wan-2.1" and bool(WAN_I2V_MODEL_ID)

    def model_specs(self) -> dict[str, tuple[str, str | None]]:
        """role → (repository id, pinned revision) for every model this worker may run."""
        specs = {"t2v": (MODEL_IDS[self.model_name], MODEL_REVISIONS.get(self.model_name))}
        if self.has_i2v():
            specs["i2v"] = (WAN_I2V_MODEL_ID, WAN_I2V_MODEL_REVISION)
        return specs

    def load(self) -> None:
        if self._loaded:
            return
        if PLACEHOLDER or not _cuda_available():
            self._loaded = True  # placeholder mode
            return
        self._load_real()
        self._loaded = True

    def _load_real(self) -> None:
        import torch  # noqa: PLC0415
        from diffusers import DiffusionPipeline  # noqa: PLC0415

        dtype = torch.bfloat16 if self.model_name == "hunyuan" else torch.float16
        # DiffusionPipeline.from_pretrained resolves the right class (Wan / Hunyuan)
        # from the repo's model_index.json — robust across diffusers versions.
        pipe = DiffusionPipeline.from_pretrained(
            MODEL_IDS[self.model_name], revision=MODEL_REVISIONS.get(self.model_name), torch_dtype=dtype
        )
        # Placement by GPU size:
        #  - Big card (>=40GB VRAM, e.g. A40/L40/A6000): hold the whole model in
        #    VRAM (fast, no system-RAM pressure).
        #  - Small card (e.g. 24GB 4090): stream components from CPU via offload.
        #    NB: offload then needs ample system RAM; a card this small may still
        #    OOM on RAM for Wan's large umt5-xxl encoder — prefer a 40GB+ GPU.
        total_vram_gb = 0.0
        try:
            total_vram_gb = torch.cuda.get_device_properties(0).total_memory / 1e9
        except Exception:
            pass
        if total_vram_gb >= 40:
            pipe.to("cuda")
        else:
            try:
                pipe.enable_model_cpu_offload()
            except Exception:
                pipe.to("cuda")
        for opt in ("enable_vae_tiling", "enable_attention_slicing"):
            try:
                getattr(pipe, opt)()
            except Exception:
                pass
        self._t2v = pipe
        self._real = True

    def _load_i2v(self):
        if self._i2v is not None or not WAN_I2V_MODEL_ID:
            return self._i2v
        import torch  # noqa: PLC0415
        from diffusers import DiffusionPipeline  # noqa: PLC0415

        pipe = DiffusionPipeline.from_pretrained(
            WAN_I2V_MODEL_ID, revision=WAN_I2V_MODEL_REVISION, torch_dtype=torch.float16
        )
        try:
            pipe.enable_model_cpu_offload()
        except Exception:
            pipe.to("cuda")
        self._i2v = pipe
        return self._i2v

    def vram_free_mb(self) -> int:
        try:
            import torch  # noqa: PLC0415

            return int(torch.cuda.mem_get_info()[0] / 1024 / 1024)
        except Exception:
            return 0

    def capabilities(self) -> dict:
        if self.model_name == "hunyuan":
            return {"model": "hunyuan", "maxDuration": 5, "resolutions": [[1280, 720], [1920, 1080]], "supportsRefImage": True, "supportsRefVideo": True, "supportsLora": True}
        return {"model": "wan-2.1", "maxDuration": 5, "resolutions": [[832, 480], [1280, 720]], "supportsRefImage": True, "supportsRefVideo": True, "supportsLora": True}

    def generate(
        self,
        *,
        prompt: str,
        negative_prompt: str | None,
        seed: int,
        duration_sec: float,
        width: int,
        height: int,
        fps: int,
        reference_image_keys: list[str],
        camera: dict,
        extra: dict,
        reference_video_keys: list[str] | None = None,
        video_op: str | None = None,
        motion_strength: float | None = None,
        lora_keys: list[str] | None = None,
        input_urls: dict[str, str] | None = None,
        legacy_fallback: bool = False,
        lora_sha256: dict[str, str] | None = None,
        strict_integrity: bool = False,
    ) -> tuple[str, str | None]:
        """Run inference and return (local_mp4_path, local_thumbnail_path).

        `input_urls` maps each input key to a one-time presigned URL (docs/39).
        When given, inputs are fetched only through it; the legacy direct-bucket
        read remains for report-mode callers that do not send URLs yet.
        """
        self.load()
        self._input_urls = input_urls
        # Report mode only: if a presigned fetch fails, read the bucket directly
        # as before, so observing the gateway never breaks generation.
        self._legacy_fallback = legacy_fallback
        # Authorized content hash per LoRA key (authz v2). Strict (enforce):
        # a mismatching or unhashed LoRA stops the job; it is never skipped.
        self._lora_sha256 = lora_sha256 or {}
        self._strict_integrity = strict_integrity
        lora_keys = lora_keys or []
        if not self._real:
            # Placeholder mode still fetches every presigned input, so the
            # one-time I/O path is exercised end to end without a GPU.
            if input_urls is not None:
                for key in [*reference_image_keys, *(reference_video_keys or [])]:
                    os.unlink(self._download(key))
                for key in lora_keys:
                    path = self._lora_or_skip(key)
                    if path:
                        os.unlink(path)
            return self._placeholder(prompt, width, height, duration_sec, fps, reference_image_keys, video_op, lora_keys)

        import torch  # noqa: PLC0415
        from diffusers.utils import export_to_video, load_image  # noqa: PLC0415

        num_frames = max(1, int(duration_sec * fps))
        # Cap the per-shot workload (all env-tunable) so a clip renders in a
        # practical time on one GPU. The worker's ~80 frames x 30 steps takes many
        # minutes per clip; these defaults bring it to ~1 min. Raise for quality.
        width = min(width, int(os.environ.get("WAN_MAX_WIDTH", "832")))
        height = min(height, int(os.environ.get("WAN_MAX_HEIGHT", "480")))
        num_frames = min(num_frames, int(os.environ.get("WAN_MAX_FRAMES", "25")))
        gen = torch.Generator(device="cuda").manual_seed(int(seed))
        steps = min(int((extra or {}).get("steps", 30)), int(os.environ.get("WAN_MAX_STEPS", "20")))
        guidance = float((extra or {}).get("guidance", 5.0))

        call = {
            "prompt": prompt,
            "negative_prompt": negative_prompt or None,
            "num_frames": num_frames,
            "height": height,
            "width": width,
            "num_inference_steps": steps,
            "guidance_scale": guidance,
            "generator": gen,
        }

        # Identity lock: a seed/reference frame drives image-to-video when an I2V
        # model is configured; otherwise we run text-to-video.
        pipe = self._t2v
        if reference_image_keys and self._load_i2v() is not None:
            pipe = self._i2v
            call["image"] = load_image(self._download(reference_image_keys[0]))

        # Per-character LoRA — the tightest identity lock (docs/28).
        fused = False
        for key in lora_keys:
            path = self._lora_or_skip(key)
            if not path:
                continue
            try:
                pipe.load_lora_weights(path)
                fused = True
            except Exception as e:  # noqa: BLE001
                print(f"[pipeline] lora load failed ({key}): {e}")
        if fused:
            try:
                pipe.fuse_lora()
            except Exception:
                pass

        try:
            result = pipe(**call)
            frames = result.frames[0]
            out = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False).name
            export_to_video(frames, out, fps=fps)
            thumb = None
            try:
                thumb = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False).name
                frames[0].save(thumb)
            except Exception:
                thumb = None
            return out, thumb
        finally:
            if fused:
                try:
                    pipe.unfuse_lora()
                    pipe.unload_lora_weights()
                except Exception:
                    pass

    # ── helpers ──────────────────────────────────────────────
    def _fetch_lora(self, key: str) -> str:
        """Download a LoRA and verify its bytes against the authorized content hash."""
        from .media_io import LoraIntegrityError, sha256_file  # noqa: PLC0415

        expected = self._lora_sha256.get(key)
        if not expected:
            if self._strict_integrity:
                raise LoraIntegrityError("LORA_UNHASHED", key)
            return self._download(key)
        path = self._download(key)
        if sha256_file(path) != expected:
            os.unlink(path)
            raise LoraIntegrityError("LORA_HASH_MISMATCH", key)
        return path

    def _lora_or_skip(self, key: str) -> str | None:
        """Strict: integrity failures propagate. Report mode: logged, LoRA skipped."""
        from .media_io import LoraIntegrityError  # noqa: PLC0415

        try:
            return self._fetch_lora(key)
        except LoraIntegrityError as e:
            if self._strict_integrity:
                raise
            print(f'{{"event":"gateway.lora_integrity","decision":"would_reject","code":{e.code!r}}}')
            return None

    def _download(self, key: str) -> str:
        """Download an input (reference frame / LoRA) to a temp file."""
        urls = getattr(self, "_input_urls", None)
        if urls is not None:
            from .media_io import fetch_to_temp, suffix_of  # noqa: PLC0415

            try:
                if key not in urls:
                    raise RuntimeError("input key has no presigned URL")
                return fetch_to_temp(urls[key], suffix=suffix_of(key))
            except Exception as e:  # noqa: BLE001
                if not getattr(self, "_legacy_fallback", False):
                    raise
                print(f'{{"event":"gateway.io_fallback","direction":"input","error":{type(e).__name__!r}}}')
        import boto3  # noqa: PLC0415

        s3 = boto3.client(
            "s3",
            endpoint_url=os.environ.get("S3_ENDPOINT") or None,
            region_name=os.environ.get("S3_REGION", "us-east-1"),
            aws_access_key_id=os.environ.get("S3_ACCESS_KEY") or os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("S3_SECRET_KEY") or os.environ.get("AWS_SECRET_ACCESS_KEY"),
        )
        suffix = os.path.splitext(key)[1] or ".bin"
        path = tempfile.NamedTemporaryFile(suffix=suffix, delete=False).name
        s3.download_file(S3_BUCKET, key, path)
        return path

    def _placeholder(self, prompt, width, height, duration_sec, fps, reference_image_keys, video_op, lora_keys) -> tuple[str, None]:
        signals = f"lora:{len(lora_keys)} ref:{len(reference_image_keys)} v2v:{video_op or '-'}"
        out = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False).name
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", f"color=c=gray:s={width}x{height}:d={duration_sec}:r={fps}",
                "-vf", (
                    f"drawtext=text='{_san(prompt)[:40]}':fontcolor=white:fontsize=24:x=20:y=20,"
                    f"drawtext=text='{_san(signals)}':fontcolor=white:fontsize=18:x=20:y=56"
                ),
                "-c:v", "libx264", "-pix_fmt", "yuv420p", out,
            ],
            check=True,
            capture_output=True,
        )
        return out, None


def _san(text: str) -> str:
    """Escape characters that would break an FFmpeg drawtext expression."""
    return text.replace("\\", " ").replace("'", " ").replace(":", " ").replace("\n", " ")


def upload_clip(local_mp4: str, key: str, local_thumb: str | None) -> str | None:
    """Upload the generated clip (and thumbnail) to S3; return the thumbnail key.
    No-ops when S3 isn't configured (keeps the placeholder path runnable locally)."""
    if not os.environ.get("S3_ACCESS_KEY") and not os.environ.get("AWS_ACCESS_KEY_ID"):
        return key.rsplit(".", 1)[0] + ".jpg" if local_thumb else None

    import boto3  # noqa: PLC0415

    s3 = boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT") or None,
        region_name=os.environ.get("S3_REGION", "us-east-1"),
        aws_access_key_id=os.environ.get("S3_ACCESS_KEY") or os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("S3_SECRET_KEY") or os.environ.get("AWS_SECRET_ACCESS_KEY"),
    )
    s3.upload_file(local_mp4, S3_BUCKET, key, ExtraArgs={"ContentType": "video/mp4"})
    thumb_key = None
    if local_thumb:
        thumb_key = key.rsplit(".", 1)[0] + ".jpg"
        s3.upload_file(local_thumb, S3_BUCKET, thumb_key, ExtraArgs={"ContentType": "image/jpeg"})
    return thumb_key
