"""Unit tests for the image verifier's pure parts (the docker parts run in CI)."""
import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

from app.code_digest import code_digest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "verify_image.py"
spec = importlib.util.spec_from_file_location("verify_image", SCRIPT)
vi = importlib.util.module_from_spec(spec)
sys.modules["verify_image"] = vi
spec.loader.exec_module(vi)

DIGEST = "sha256:" + "a" * 64


def test_parse_ref_accepts_only_immutable_references():
    assert vi.parse_ref(f"docker.io/icofcucam/cineforge-gpu@{DIGEST}") == ("docker.io/icofcucam/cineforge-gpu", DIGEST)
    for bad in ["icofcucam/cineforge-gpu:latest", "icofcucam/cineforge-gpu:sha-abc",
                f"icofcucam/cineforge-gpu@sha256:{'A' * 64}", "icofcucam/cineforge-gpu@sha256:abc", ""]:
        with pytest.raises(ValueError):
            vi.parse_ref(bad)


def test_image_env_and_repo_digest():
    inspect = {"Config": {"Env": ["A=1", "CINEFORGE_SOURCE_COMMIT=" + "b" * 40, "EMPTY="]},
               "RepoDigests": [f"icofcucam/cineforge-gpu@{DIGEST}"]}
    env = vi.image_env(inspect)
    assert env["CINEFORGE_SOURCE_COMMIT"] == "b" * 40 and env["EMPTY"] == ""
    assert vi.repo_digests_match(inspect, DIGEST)
    assert not vi.repo_digests_match(inspect, "sha256:" + "c" * 64)
    assert not vi.repo_digests_match({}, DIGEST)


def test_listing_parse_and_diff():
    listing = "h1  a.py\nh2  gateway/b.py\nDIGEST\n"
    files, digest = vi.code_digest_lines(listing)
    assert files == {"a.py": "h1", "gateway/b.py": "h2"} and digest == "DIGEST"
    assert vi.diff_files(files, files) == []
    assert vi.diff_files(files, {"a.py": "hX", "c.py": "h3"}) == [
        "differs: a.py", "extra in image: c.py", "missing in image: gateway/b.py"]


def test_report_passes_only_with_all_checks():
    rep = vi.Report(image="x")
    assert not rep.passed
    rep.add("one", True)
    assert rep.passed
    rep.add("two", False, "why")
    assert not rep.passed and rep.to_json()["checks"][1] == {"name": "two", "ok": False, "detail": "why"}


def test_git_listing_matches_committed_tree():
    root = vi.REPO_ROOT
    head = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True)
    if head.returncode != 0:
        pytest.skip("not a git checkout")
    dirty = subprocess.run(["git", "-C", str(root), "status", "--porcelain", "--", vi.APP_DIR],
                           capture_output=True, text=True).stdout.strip()
    _, digest = vi.code_digest_lines(vi.git_listing(head.stdout.strip()))
    if dirty:
        assert len(digest) == 64
    else:
        assert digest == code_digest(root / vi.APP_DIR)
