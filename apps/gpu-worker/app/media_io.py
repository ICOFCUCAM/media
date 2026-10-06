"""One-time media I/O through URLs Cineforge presigns per job (docs/38 §O, §P;
docs/39). The GPU worker holds no storage credentials: it can read only the
inputs and write only the outputs of the job it is running."""

from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
import urllib.parse
import urllib.request

_TIMEOUT = 300
_MAX_INPUT_BYTES = 2 * 1024**3  # LoRAs and frames; a guard, not a quota


class MediaUrlError(RuntimeError):
    pass


class LoraIntegrityError(RuntimeError):
    """A LoRA's bytes do not match the content hash Cineforge authorized."""

    def __init__(self, code: str, key: str) -> None:
        super().__init__(f"{code}: {key}")
        self.code = code
        self.key = key


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _check_url(url: str) -> None:
    scheme = urllib.parse.urlsplit(url).scheme
    # Plain HTTP only for local tests/e2e; presigned URLs are secrets in transit.
    if scheme != "https" and not (scheme == "http" and os.environ.get("GATEWAY_ALLOW_HTTP_STORAGE") == "1"):
        raise MediaUrlError("storage URL must be https")


def fetch_to_temp(url: str, suffix: str = "") -> str:
    """Download one presigned object to a temp file and return its path."""
    _check_url(url)
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        with urllib.request.urlopen(url, timeout=_TIMEOUT) as res, os.fdopen(fd, "wb") as out:  # noqa: S310
            copied = 0
            while chunk := res.read(1 << 20):
                copied += len(chunk)
                if copied > _MAX_INPUT_BYTES:
                    raise MediaUrlError("input object too large")
                out.write(chunk)
    except Exception:
        os.unlink(path)
        raise
    return path


def put_file(url: str, local_path: str, content_type: str) -> int:
    """Upload a file to a presigned/signed upload URL; return its size in bytes."""
    _check_url(url)
    size = os.path.getsize(local_path)
    with open(local_path, "rb") as f:
        req = urllib.request.Request(
            url,
            data=f,
            method="PUT",
            # The content type is part of an S3 presigned PUT signature.
            headers={"Content-Type": content_type, "Content-Length": str(size), "x-upsert": "false"},
        )
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as res:  # noqa: S310
            if res.status not in (200, 201, 204):
                raise MediaUrlError(f"upload failed with HTTP {res.status}")
    return size


def suffix_of(key: str) -> str:
    return os.path.splitext(key)[1]


def copy_to_temp(src: str) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix_of(src))
    os.close(fd)
    shutil.copyfile(src, path)
    return path


STORAGE_CREDENTIAL_ENV = ("S3_ACCESS_KEY", "S3_SECRET_KEY", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")


def storage_credentials_present(env: dict[str, str] | None = None) -> list[str]:
    env = os.environ if env is None else env
    return [k for k in STORAGE_CREDENTIAL_ENV if env.get(k)]
