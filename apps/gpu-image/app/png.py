"""A minimal PNG encoder (standard library only) for the explicit placeholder
mode. Never used for real output: placeholder stills say so in `execution`."""
from __future__ import annotations

import hashlib
import struct
import zlib


def _chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def placeholder_png(width: int, height: int, seed: int, text: str) -> bytes:
    """A deterministic two-tone gradient: same seed + text → same bytes."""
    h = hashlib.sha256(f"{seed}:{text}".encode()).digest()
    a, b = h[:3], h[3:6]
    rows = []
    for y in range(height):
        t = y / max(1, height - 1)
        px = bytes(int(a[i] * (1 - t) + b[i] * t) for i in range(3))
        rows.append(b"\x00" + px * width)
    raw = b"".join(rows)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", zlib.compress(raw, 6)) + _chunk(b"IEND", b"")


def png_size(data: bytes) -> tuple[int, int] | None:
    """(width, height) of a PNG, or None when the bytes are not a PNG."""
    if len(data) < 24 or not data.startswith(b"\x89PNG\r\n\x1a\n") or data[12:16] != b"IHDR":
        return None
    return struct.unpack(">II", data[16:24])
