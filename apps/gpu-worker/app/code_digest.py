"""Content digest of the worker's Python source (docs/39 §10 image verification).

The same function runs in two places:
  * inside the image — ``/capabilities`` reports ``image.codeSha256`` so a live
    pod can be checked without pulling the image;
  * against a git checkout — the verification workflow computes the digest of
    ``apps/gpu-worker/app`` at ``SOURCE_COMMIT`` and compares.

Digest = sha256 over sorted lines ``<relpath>\\0<sha256(file)>\\n`` for every
``*.py`` file under the package (``__pycache__`` excluded). Status information
only: it proves which code a pod runs, it does not authorize anything.

CLI: ``python3 code_digest.py <dir>`` prints the digest; ``--list`` prints the
per-file lines too.
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path


def file_hashes(root: Path) -> list[tuple[str, str]]:
    out = []
    for p in sorted(root.rglob("*.py")):
        if "__pycache__" in p.parts:
            continue
        out.append((p.relative_to(root).as_posix(), hashlib.sha256(p.read_bytes()).hexdigest()))
    return out


def code_digest(root: Path) -> str:
    h = hashlib.sha256()
    for rel, digest in file_hashes(root):
        h.update(f"{rel}\0{digest}\n".encode())
    return h.hexdigest()


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    root = Path(args[0]) if args else Path(__file__).resolve().parent
    if "--list" in argv:
        for rel, digest in file_hashes(root):
            print(f"{digest}  {rel}")
    print(code_digest(root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
