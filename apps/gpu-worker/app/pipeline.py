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
            }
        return {
            "model": "wan-2.1",
            "maxDuration": 5,
            "resolutions": [[832, 480], [1280, 720]],
            "supportsRefImage": True,
        }

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
    ) -> tuple[str, str | None]:
        """Run inference and return (local_mp4_path, local_thumbnail_path)."""
        self.load()

        # ── Real inference (per model) ───────────────────────
        # frames = self._model(
        #     prompt=prompt, negative_prompt=negative_prompt,
        #     num_frames=int(duration_sec * fps), height=height, width=width,
        #     generator=torch.Generator("cuda").manual_seed(seed),
        #     reference_images=load_refs(reference_image_keys), **extra,
        # )
        # mp4 = export_to_video(frames, fps=fps)

        # Scaffold: emit a placeholder clip with FFmpeg so the pipeline is
        # runnable end-to-end without GPU weights.
        out = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False).name
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", f"color=c=gray:s={width}x{height}:d={duration_sec}:r={fps}",
                "-vf", f"drawtext=text='{prompt[:40]}':fontcolor=white:fontsize=24:x=20:y=20",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", out,
            ],
            check=True,
            capture_output=True,
        )
        return out, None


def upload_clip(local_mp4: str, key: str, local_thumb: str | None) -> str | None:
    """Upload the generated clip (and thumbnail) to S3; return thumbnail key."""
    # import boto3
    # s3 = boto3.client("s3", endpoint_url=os.environ["S3_ENDPOINT"], ...)
    # s3.upload_file(local_mp4, S3_BUCKET, key)
    # if local_thumb: s3.upload_file(local_thumb, S3_BUCKET, key + ".jpg")
    _ = (local_mp4, key, local_thumb)
    return key + ".jpg" if local_thumb else None
