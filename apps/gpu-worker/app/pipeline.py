"""
Model loading + inference + S3 upload for the GPU worker.

This is a scaffold: `load()` and `generate()` contain the integration points for
the real Wan 2.1 / Hunyuan Video weights. Keep the model loaded once and reuse
it across requests (warm) to amortize load time on the A40 48GB.
"""

from __future__ import annotations

import os
import subprocess
import tempfile

# import torch  # real impl
# from diffusers import ... / model-specific loader

S3_BUCKET = os.environ.get("S3_BUCKET", "cineforge-assets")


class VideoPipeline:
    def __init__(self, model_name: str) -> None:
        self.model_name = model_name
        self._model = None

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        if self._model is not None:
            return
        # ── Wan 2.1 ──────────────────────────────────────────
        # self._model = load_wan21(dtype=torch.float16).to("cuda")
        # ── Hunyuan Video ────────────────────────────────────
        # self._model = load_hunyuan(dtype=torch.bfloat16).to("cuda")
        self._model = object()  # placeholder so the scaffold runs

    def vram_free_mb(self) -> int:
        # return int(torch.cuda.mem_get_info()[0] / 1024 / 1024)
        return 0

    def capabilities(self) -> dict:
        if self.model_name == "hunyuan":
            return {
                "model": "hunyuan",
                "maxDuration": 5,
                "resolutions": [[1280, 720], [1920, 1080]],
                "supportsRefImage": True,
                "supportsRefVideo": True,
                "supportsLora": True,
            }
        return {
            "model": "wan-2.1",
            "maxDuration": 5,
            "resolutions": [[832, 480], [1280, 720]],
            "supportsRefImage": True,
            "supportsRefVideo": True,
            "supportsLora": True,
        }

    def _apply_loras(self, lora_keys: list[str]) -> None:
        """Load + fuse per-character LoRA adapters for identity lock (docs/28)."""
        if not lora_keys:
            return
        # ── Real impl ────────────────────────────────────────
        # for key in lora_keys:
        #     path = download(key)                       # S3 -> local .safetensors
        #     self._model.load_lora_weights(path)        # diffusers / peft
        # self._model.fuse_lora()
        # (Unfuse/unload after generate() to keep the base model clean.)
        return

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
    ) -> tuple[str, str | None]:
        """Run inference and return (local_mp4_path, local_thumbnail_path)."""
        self.load()

        reference_video_keys = reference_video_keys or []
        lora_keys = lora_keys or []

        # Identity lock: load any per-character LoRA before inference.
        self._apply_loras(lora_keys)

        # ── Real inference (per model) ───────────────────────
        # refs = load_images(reference_image_keys)       # IP-adapter / seed frames
        # init_video = load_video(reference_video_keys[0]) if reference_video_keys else None
        # frames = self._model(
        #     prompt=prompt, negative_prompt=negative_prompt,
        #     num_frames=int(duration_sec * fps), height=height, width=width,
        #     generator=torch.Generator("cuda").manual_seed(seed),
        #     ip_adapter_image=refs or None,             # identity from reference frames
        #     video=init_video, strength=motion_strength or 0.7,  # video-to-video (motion style)
        #     **extra,
        # )
        # mp4 = export_to_video(frames, fps=fps)

        # Scaffold: emit a placeholder clip with FFmpeg so the pipeline is
        # runnable end-to-end without GPU weights. The overlay surfaces which
        # conditioning signals were honored, so the wiring is observable.
        signals = f"lora:{len(lora_keys)} ref:{len(reference_image_keys)} v2v:{video_op or '-'}"
        out = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False).name
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", f"color=c=gray:s={width}x{height}:d={duration_sec}:r={fps}",
                "-vf", (
                    f"drawtext=text='{_san(prompt)[:40]}':fontcolor=white:fontsize=24:x=20:y=20,"
                    f"drawtext=text='{signals}':fontcolor=white:fontsize=18:x=20:y=56"
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
    """Upload the generated clip (and thumbnail) to S3; return thumbnail key."""
    # import boto3
    # s3 = boto3.client("s3", endpoint_url=os.environ["S3_ENDPOINT"], ...)
    # s3.upload_file(local_mp4, S3_BUCKET, key)
    # if local_thumb: s3.upload_file(local_thumb, S3_BUCKET, key + ".jpg")
    _ = (local_mp4, key, local_thumb)
    return key + ".jpg" if local_thumb else None
