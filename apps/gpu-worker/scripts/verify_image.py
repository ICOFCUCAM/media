#!/usr/bin/env python3
"""Verify a GPU worker image before it is deployed (docs/39 §10, step R0).

    Base commit → GPU image → immutable digest → verify contents → deploy → verify runtime

This script is the "verify contents" step, plus a runtime smoke test of the
security boundary. It never deploys anything and needs no GPU:

  1. Identity   the reference is immutable (repo@sha256:<64 hex>); the pulled
                image really has that digest.
  2. Source     the image's CINEFORGE_SOURCE_COMMIT (and OCI revision label)
                names a commit that exists in this git checkout, and equals
                --expect-commit when given.
  3. Contents   the code digest of /app/app inside the image equals the code
                digest of apps/gpu-worker/app at that commit (app/code_digest.py,
                run from the checkout so older images can be checked too).
  4. Runtime    the image is started in placeholder mode with GATEWAY_MODE=enforce
                and an ephemeral key, and the gateway is probed: public /livez,
                no token / foreign key / replayed token rejected, /capabilities
                reports the same source commit and code digest.

Exit 0 only when every check passes. A machine-readable report is written with
--report. Usage:

    python3 apps/gpu-worker/scripts/verify_image.py \\
        docker.io/icofcucam/cineforge-gpu@sha256:<digest> [--expect-commit <sha>] [--report out.json]
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
APP_DIR = "apps/gpu-worker/app"
DIGEST_SCRIPT = REPO_ROOT / APP_DIR / "code_digest.py"
IMMUTABLE_REF = re.compile(r"^(?P<repo>[^\s@]+)@(?P<digest>sha256:[0-9a-f]{64})$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")
DEPLOYMENT = "verify-image"


@dataclass
class Check:
    name: str
    ok: bool
    detail: str = ""


@dataclass
class Report:
    image: str
    checks: list[Check] = field(default_factory=list)
    facts: dict = field(default_factory=dict)

    def add(self, name: str, ok: bool, detail: str = "") -> bool:
        self.checks.append(Check(name, ok, detail))
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail else ""), flush=True)
        return ok

    @property
    def passed(self) -> bool:
        return bool(self.checks) and all(c.ok for c in self.checks)

    def to_json(self) -> dict:
        return {"image": self.image, "passed": self.passed, "facts": self.facts,
                "checks": [c.__dict__ for c in self.checks]}


# ── pure helpers (unit-tested) ──────────────────────────────────────────────
def parse_ref(ref: str) -> tuple[str, str]:
    m = IMMUTABLE_REF.match(ref.strip())
    if not m:
        raise ValueError(f"not an immutable image reference (repo@sha256:<64 hex>): {ref!r}")
    return m["repo"], m["digest"]


def image_env(config: dict) -> dict[str, str]:
    out = {}
    for entry in (config.get("Config") or {}).get("Env") or []:
        k, _, v = entry.partition("=")
        out[k] = v
    return out


def repo_digests_match(inspect: dict, digest: str) -> bool:
    return any(d.endswith("@" + digest) for d in inspect.get("RepoDigests") or [])


def code_digest_lines(listing: str) -> tuple[dict[str, str], str]:
    """Parse `code_digest.py --list` output into ({relpath: sha256}, digest)."""
    lines = [l for l in listing.strip().splitlines() if l.strip()]
    files = {}
    for l in lines[:-1]:
        h, _, rel = l.partition("  ")
        files[rel] = h
    return files, lines[-1].strip() if lines else ""


def diff_files(expected: dict[str, str], actual: dict[str, str]) -> list[str]:
    out = []
    for rel in sorted(set(expected) | set(actual)):
        if rel not in actual:
            out.append(f"missing in image: {rel}")
        elif rel not in expected:
            out.append(f"extra in image: {rel}")
        elif expected[rel] != actual[rel]:
            out.append(f"differs: {rel}")
    return out


# ── side effects ────────────────────────────────────────────────────────────
def sh(*args: str, check: bool = True, input: bytes | None = None) -> str:
    r = subprocess.run(args, capture_output=True, input=input)
    if check and r.returncode != 0:
        raise RuntimeError(f"{' '.join(args[:3])}… failed: {r.stderr.decode(errors='replace').strip()[-400:]}")
    return r.stdout.decode()


def git_listing(commit: str) -> str:
    """code_digest --list of apps/gpu-worker/app exactly as committed."""
    with tempfile.TemporaryDirectory() as tmp:
        archive = subprocess.run(["git", "-C", str(REPO_ROOT), "archive", "--format=tar", commit, APP_DIR],
                                 capture_output=True, check=True).stdout
        tar_path = Path(tmp) / "src.tar"
        tar_path.write_bytes(archive)
        with tarfile.open(tar_path) as t:
            try:
                t.extractall(tmp, filter="data")
            except TypeError:  # Python without extraction filters; the archive is our own git tree
                t.extractall(tmp)
        return sh(sys.executable, "-I", str(DIGEST_SCRIPT), str(Path(tmp) / APP_DIR), "--list")


def image_listing(ref: str) -> str:
    return sh("docker", "run", "--rm", "--network=none", "--entrypoint", "python3",
              "-v", f"{DIGEST_SCRIPT}:/verify/code_digest.py:ro", ref,
              "-I", "/verify/code_digest.py", "/app/app", "--list")


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


class Keys:
    def __init__(self) -> None:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        self.priv = Ed25519PrivateKey.generate()
        self.foreign = Ed25519PrivateKey.generate()
        raw = self.priv.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self.public_spec = f"verify:{b64url(raw)}"

    def token(self, *, scope: str = "status", body: bytes = b"", foreign: bool = False, jti: str | None = None) -> str:
        import jwt

        now = int(time.time())
        claims = {"iss": "cineforge-worker", "aud": DEPLOYMENT, "sub": "verify", "scope": scope,
                  "jti": jti or uuid.uuid4().hex, "iat": now, "exp": now + 60,
                  "bh": hashlib.sha256(body).hexdigest()}
        return jwt.encode(claims, self.foreign if foreign else self.priv, algorithm="EdDSA",
                          headers={"kid": "verify"})


def http(method: str, url: str, token: str | None = None, body: bytes | None = None) -> tuple[int, bytes]:
    req = urllib.request.Request(url, method=method, data=body)
    if token:
        req.add_header("authorization", f"Bearer {token}")
    if body is not None:
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def runtime_probes(rep: Report, ref: str, commit: str, code_sha: str, port: int) -> None:
    keys = Keys()
    name = f"cineforge-verify-{uuid.uuid4().hex[:8]}"
    sh("docker", "run", "-d", "--rm", "--name", name, "-p", f"127.0.0.1:{port}:8000",
       "-e", "CINEFORGE_PLACEHOLDER=1", "-e", "GATEWAY_MODE=enforce",
       "-e", f"DEPLOYMENT_ID={DEPLOYMENT}", "-e", f"GPU_JWT_PUBLIC_KEYS={keys.public_spec}", ref)
    base = f"http://127.0.0.1:{port}"
    try:
        up = False
        for _ in range(120):
            try:
                up = http("GET", f"{base}/livez")[0] == 200
            except (urllib.error.URLError, ConnectionError, OSError):
                up = False
            if up:
                break
            time.sleep(1)
        if not rep.add("runtime: starts in enforce mode and /livez answers", up):
            print(sh("docker", "logs", name, check=False)[-2000:])
            return
        rejected = (401, 403)
        st, _ = http("GET", f"{base}/health")
        rep.add("runtime: /health without a token is rejected", st in rejected, f"HTTP {st}")
        st, _ = http("POST", f"{base}/generate", body=b"{}")
        rep.add("runtime: /generate without a token is rejected", st in rejected, f"HTTP {st}")
        st, _ = http("POST", f"{base}/train", body=b"{}")
        rep.add("runtime: /train is not an open endpoint", st in rejected + (404, 405, 410, 503), f"HTTP {st}")
        st, _ = http("GET", f"{base}/health", token=keys.token(foreign=True))
        rep.add("runtime: a token from a foreign key is rejected", st in rejected, f"HTTP {st}")
        jti = uuid.uuid4().hex
        first, _ = http("GET", f"{base}/health", token=keys.token(jti=jti))
        second, _ = http("GET", f"{base}/health", token=keys.token(jti=jti))
        rep.add("runtime: a valid token is accepted once, its replay rejected",
                first == 200 and second in rejected, f"HTTP {first} then {second}")
        st, raw = http("GET", f"{base}/capabilities", token=keys.token())
        caps = json.loads(raw) if st == 200 else {}
        img = caps.get("image") or {}
        rep.facts["capabilities"] = {"gatewayMode": caps.get("gatewayMode"), "image": img,
                                     "authzVersion": (caps.get("manifest") or {}).get("authzVersion")}
        rep.add("runtime: /capabilities reports gatewayMode=enforce", caps.get("gatewayMode") == "enforce",
                str(caps.get("gatewayMode")))
        rep.add("runtime: reported sourceCommit matches", img.get("sourceCommit") == commit, str(img.get("sourceCommit")))
        if "codeSha256" in img:
            rep.add("runtime: reported codeSha256 matches the code in git", img["codeSha256"] == code_sha, img["codeSha256"])
        else:
            rep.facts["note"] = "image predates codeSha256 reporting; contents were checked offline only"
    finally:
        sh("docker", "rm", "-f", name, check=False)


def verify(ref: str, expect_commit: str | None, port: int, skip_runtime: bool) -> Report:
    rep = Report(image=ref)
    try:
        _, digest = parse_ref(ref)
    except ValueError as e:
        rep.add("identity: immutable repo@sha256 reference", False, str(e))
        return rep
    rep.add("identity: immutable repo@sha256 reference", True, digest)
    sh("docker", "pull", "-q", ref)
    inspect = json.loads(sh("docker", "image", "inspect", ref))[0]
    rep.add("identity: pulled image has this digest", repo_digests_match(inspect, digest),
            ", ".join(inspect.get("RepoDigests") or []))

    env = image_env(inspect)
    commit = env.get("CINEFORGE_SOURCE_COMMIT", "")
    label = ((inspect.get("Config") or {}).get("Labels") or {}).get("org.opencontainers.image.revision")
    rep.facts.update(sourceCommit=commit, ociRevision=label, digest=digest,
                     created=inspect.get("Created"), sizeBytes=inspect.get("Size"))
    if not rep.add("source: CINEFORGE_SOURCE_COMMIT is a full commit id", bool(COMMIT.match(commit)), commit or "missing"):
        return rep
    if label is not None:
        rep.add("source: OCI revision label agrees", label == commit, label)
    if expect_commit:
        rep.add("source: equals the expected commit", commit == expect_commit, expect_commit)
    exists = subprocess.run(["git", "-C", str(REPO_ROOT), "cat-file", "-e", f"{commit}^{{commit}}"]).returncode == 0
    if not rep.add("source: commit exists in this repository", exists):
        return rep

    expected_files, expected = code_digest_lines(git_listing(commit))
    actual_files, actual = code_digest_lines(image_listing(ref))
    rep.facts.update(codeSha256Git=expected, codeSha256Image=actual, files=len(expected_files))
    diffs = diff_files(expected_files, actual_files)
    rep.add("contents: /app/app is exactly apps/gpu-worker/app at the source commit",
            expected == actual and not diffs, f"{len(expected_files)} files" if not diffs else "; ".join(diffs[:10]))

    if not skip_runtime:
        runtime_probes(rep, ref, commit, expected, port)
    return rep


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("image", help="repo@sha256:<digest>")
    ap.add_argument("--expect-commit")
    ap.add_argument("--report")
    ap.add_argument("--port", type=int, default=18000)
    ap.add_argument("--skip-runtime", action="store_true")
    a = ap.parse_args(argv)
    if shutil.which("docker") is None:
        print("docker is required", file=sys.stderr)
        return 2
    rep = verify(a.image, a.expect_commit, a.port, a.skip_runtime)
    if a.report:
        Path(a.report).write_text(json.dumps(rep.to_json(), indent=2))
    print("VERIFIED" if rep.passed else "NOT VERIFIED")
    return 0 if rep.passed else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
