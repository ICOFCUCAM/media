#!/usr/bin/env python3
"""Install the registry's custom ComfyUI nodes at build time (docs/38 §AT.7, §AT.10).

Reads `customNodes` from workflows/manifest.json. Each entry is
{"repo": "https://github.com/<org>/<name>", "commit": "<40 hex>", "licence": "<SPDX>"}.
Each is cloned into <comfy>/custom_nodes/<name>, checked out at exactly that
commit (verified after checkout), and its requirements are installed under the
image's constraints. Nothing is installed at runtime: ComfyUI starts with
--disable-all-custom-nodes and whitelists only these folders.

Today the registry needs no custom nodes (every node the workflows use is in
ComfyUI core at the pinned commit), so this installs nothing; it exists so a
future node is added the pinned way and no other.

Usage: install_custom_nodes.py <manifest.json> <comfy_dir> [--constraints <file>]
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

_COMMIT = re.compile(r"^[0-9a-f]{40}$")
_REPO = re.compile(r"^https://github\.com/[A-Za-z0-9_.-]+/(?P<name>[A-Za-z0-9_.-]+?)(?:\.git)?$")
# Licences a node may carry: it runs in-process with ComfyUI (GPL-3.0), docs/38 §AT.15.
NODE_LICENCES = {"GPL-3.0-only", "GPL-3.0-or-later", "MIT", "Apache-2.0", "BSD-3-Clause"}


def plan(manifest: dict) -> list[dict]:
    """Validated install plan, or ValueError naming the first bad entry."""
    out = []
    for n in manifest.get("customNodes") or []:
        m = _REPO.match(str(n.get("repo", "")))
        if not m:
            raise ValueError(f"custom node repo must be an https://github.com URL: {n.get('repo')!r}")
        if not _COMMIT.match(str(n.get("commit", ""))):
            raise ValueError(f"custom node {n['repo']} must be pinned to a 40-hex commit (no branch, no tag)")
        if n.get("licence") not in NODE_LICENCES:
            raise ValueError(f"custom node {n['repo']} licence {n.get('licence')!r} is not approved")
        out.append({"repo": n["repo"], "commit": n["commit"], "name": m["name"], "licence": n["licence"]})
    return out


def install(entries: list[dict], comfy_dir: Path, constraints: str | None) -> None:
    for e in entries:
        dest = comfy_dir / "custom_nodes" / e["name"]
        subprocess.run(["git", "init", "-q", str(dest)], check=True)
        subprocess.run(["git", "-C", str(dest), "fetch", "-q", "--depth", "1", e["repo"], e["commit"]], check=True)
        subprocess.run(["git", "-C", str(dest), "checkout", "-q", "FETCH_HEAD"], check=True)
        head = subprocess.run(["git", "-C", str(dest), "rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()
        if head != e["commit"]:
            raise SystemExit(f"{e['repo']}: checked out {head}, expected {e['commit']}")
        req = dest / "requirements.txt"
        if req.exists():
            cmd = [sys.executable, "-m", "pip", "install", "--no-cache-dir", "-r", str(req)]
            if constraints:
                cmd += ["-c", constraints]
            subprocess.run(cmd, check=True)
        print(f"installed {e['name']} @ {e['commit']} ({e['licence']})")


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    constraints = argv[argv.index("--constraints") + 1] if "--constraints" in argv else None
    entries = plan(json.loads(Path(argv[0]).read_text()))
    install(entries, Path(argv[1]), constraints)
    print(f"{len(entries)} custom node(s) installed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
