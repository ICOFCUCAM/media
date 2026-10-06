"""Integration tests through the real FastAPI app with a fake pipeline.

Covers docs/38 §AW.11 regression tests 5 (unauthorized model substitution) and
6 (unauthenticated GPU request), plus the route-level gateway contract.
"""

from __future__ import annotations

import json

import pytest

from app.gateway import GatewayConfigError, authz_digest
from app.gateway.authz import TimingRequest

from .conftest import DEPLOYMENT, FakePipeline, build_client, fake_weights
from app.gateway.manifest import ModelSpec

T2V = ("Wan-AI/Wan2.1-T2V-1.3B-Diffusers", "a" * 40)
LORA = "projects/p1/identities/c1/v1/lora.safetensors"
LORA_SHA = "ab" * 32
I2V = ("Wan-AI/Wan2.1-I2V-14B-480P-Diffusers", "b" * 40)


OUTPUT = {"videoKey": "projects/p1/video/grant-1.mp4", "videoUploadUrl": "https://store.example/put/v?sig=1",
          "thumbnailKey": "projects/p1/video/grant-1.thumb.jpg", "thumbnailUploadUrl": "https://store.example/put/t?sig=1"}


def gen_body(**over) -> bytes:
    body = {"jobId": "grant-1", "prompt": "a lighthouse at dusk", "durationSec": 5.0,
            "width": 832, "height": 480, "fps": 16, "output": OUTPUT, **over}
    if body.get("output") is None:
        body.pop("output")
    keys = [*(body.get("referenceImageKeys") or []), *(body.get("loraKeys") or [])]
    if keys and "inputUrls" not in body:
        body["inputUrls"] = {k: f"https://store.example/get/{k}?sig=1" for k in keys}
    if body.get("loraKeys") and "loraSha256" not in body:
        body["loraSha256"] = {k: LORA_SHA for k in body["loraKeys"]}
    return json.dumps(body).encode()


def cineforge_authz(*, workflow="diffusers.wan-2.1.t2v@1", runtime="placeholder", role="t2v",
                    model=T2V, weights="placeholder", loras=(), duration_us=5_000_000, fps=16,
                    width=832, height=480) -> str:
    """The digest Cineforge would sign for an approved route."""
    return authz_digest(
        workflow=workflow, runtime=runtime,
        models=[{"role": role, "id": model[0], "revision": model[1], "weights": weights}],
        loras=[{"key": k, "sha256": h} for k, h in loras],
        timing=TimingRequest(duration_us=duration_us, fps=fps, width=width, height=height),
    )


def post(client, body: bytes, token: str | None):
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    return client.post("/generate", content=body, headers=headers)


# ── Regression test 6: unauthenticated GPU request ────────────────────────────

PROTECTED = [("GET", "/health"), ("GET", "/capabilities"), ("POST", "/warm"), ("POST", "/generate")]


@pytest.mark.parametrize("method,path", PROTECTED)
@pytest.mark.parametrize("token", [None, "garbage", "expired"])
def test_regression_6_unauthenticated_requests_rejected(signing_key, mint, method, path, token):
    client, pipeline, _ = build_client(signing_key)
    with client:
        body = gen_body() if path == "/generate" else b""
        if token == "expired":
            token = mint.token(body, scope="video:run status warm", iat=1_000_000, authz=cineforge_authz())
        headers = {"content-type": "application/json"}
        if token:
            headers["authorization"] = f"Bearer {token}"
        r = client.request(method, path, content=body, headers=headers)
    assert r.status_code == 401, r.text
    assert pipeline.calls == []


def test_livez_is_public_and_discloses_nothing(signing_key):
    client, _, _ = build_client(signing_key)
    with client:
        r = client.get("/livez")
    assert r.status_code == 200 and r.text == "ok"


def test_authorized_generate_runs(signing_key, mint):
    client, pipeline, app = build_client(signing_key)
    body = gen_body()
    with client:
        r = post(client, body, mint.token(body, authz=cineforge_authz()))
    assert r.status_code == 200, r.text
    assert len(pipeline.calls) == 1
    # Outputs go only to the keys Cineforge granted, through the one-time URL.
    assert r.json()["videoKey"] == OUTPUT["videoKey"] and r.json()["videoBytes"] == 4321
    assert app.state.fake_store.puts == [(OUTPUT["videoUploadUrl"], "video/mp4")]
    assert app.state.fake_store.legacy == []


def test_enforce_requires_output_target(signing_key, mint):
    client, pipeline, _ = build_client(signing_key)
    body = gen_body(output=None)
    with client:
        r = post(client, body, mint.token(body, authz=cineforge_authz()))
    assert r.json()["detail"]["error"] == "OUTPUT_TARGET_MISSING" and pipeline.calls == []


def test_enforce_requires_a_url_for_every_input(signing_key, mint):
    client, pipeline, _ = build_client(signing_key)
    body = gen_body(loraKeys=[LORA], inputUrls={})
    authz = cineforge_authz(loras=((LORA, LORA_SHA),))
    with client:
        r = post(client, body, mint.token(body, authz=authz))
    assert r.json()["detail"]["error"] == "INPUT_URL_MISSING" and pipeline.calls == []


def test_presigned_input_urls_reach_the_pipeline(signing_key, mint):
    client, pipeline, _ = build_client(signing_key)
    body = gen_body(loraKeys=[LORA])
    authz = cineforge_authz(loras=((LORA, LORA_SHA),))
    with client:
        r = post(client, body, mint.token(body, authz=authz))
    assert r.status_code == 200, r.text
    assert pipeline.calls[0]["lora_sha256"] == {LORA: LORA_SHA} and pipeline.calls[0]["strict_integrity"] is True
    assert pipeline.calls[0]["input_urls"] == {"projects/p1/identities/c1/v1/lora.safetensors":
                                               "https://store.example/get/projects/p1/identities/c1/v1/lora.safetensors?sig=1"}


def test_enforce_refuses_to_start_with_storage_credentials(signing_key, monkeypatch):
    monkeypatch.setenv("S3_SECRET_KEY", "permanent-secret")
    client, _, _ = build_client(signing_key)
    with pytest.raises(GatewayConfigError):
        with client:
            pass


def test_status_scope_reads_health_and_manifest(signing_key, mint):
    client, _, _ = build_client(signing_key)
    with client:
        h = client.get("/health", headers={"authorization": f"Bearer {mint.token(b'', scope='status')}"})
        c = client.get("/capabilities", headers={"authorization": f"Bearer {mint.token(b'', scope='status')}"})
    assert h.status_code == 200 and c.status_code == 200
    m = c.json()["manifest"]
    assert c.json()["deploymentId"] == DEPLOYMENT and m["authzVersion"] == 2
    assert m["models"][0]["role"] == "t2v"


def test_status_token_cannot_generate(signing_key, mint):
    client, pipeline, _ = build_client(signing_key)
    body = gen_body()
    with client:
        r = post(client, body, mint.token(body, scope="status", authz=cineforge_authz()))
    assert r.status_code == 403 and r.json()["detail"]["error"] == "WRONG_SCOPE"
    assert pipeline.calls == []


# ── Regression test 5: unauthorized model substitution ────────────────────────

REAL_T2V_WEIGHTS = fake_weights(ModelSpec("t2v", *T2V))


@pytest.mark.parametrize(
    "label, authz_kwargs",
    [
        ("different revision", {"model": (T2V[0], "c" * 40)}),
        ("different model", {"model": ("Some/Other-Model", T2V[1])}),
        ("different weights", {"weights": "0" * 64}),
        ("different runtime", {"runtime": "diffusers@0.0.1"}),
        ("different workflow", {"workflow": "diffusers.wan-2.1.i2v@1"}),
        ("unapproved lora", {"loras": ()}),
        ("different lora content", {"loras": ((LORA, "cd" * 32),)}),
        ("different timing", {"duration_us": 4_000_000}),
    ],
)
def test_regression_5_model_substitution_rejected(signing_key, mint, label, authz_kwargs):
    # A real (non-placeholder) worker: the token was approved for one route, the
    # request/worker resolves to another → AUTHZ_MISMATCH, nothing runs.
    pipeline = FakePipeline(real=True)
    client, pipeline, _ = build_client(signing_key, pipeline=pipeline)
    body = gen_body(loraKeys=[LORA])
    approved = dict(runtime=_runtime(), weights=REAL_T2V_WEIGHTS, loras=((LORA, LORA_SHA),))
    approved.update(authz_kwargs)
    with client:
        r = post(client, body, mint.token(body, authz=cineforge_authz(**approved)))
    assert r.status_code == 403, label
    assert r.json()["detail"]["error"] == "AUTHZ_MISMATCH", label
    assert pipeline.calls == []


def test_regression_5_matching_real_route_is_allowed(signing_key, mint):
    client, pipeline, _ = build_client(signing_key, pipeline=FakePipeline(real=True))
    body = gen_body()
    with client:
        r = post(client, body, mint.token(body, authz=cineforge_authz(runtime=_runtime(), weights=REAL_T2V_WEIGHTS)))
    assert r.status_code == 200, r.text


def test_reference_frame_without_i2v_cannot_be_approved_as_i2v(signing_key, mint):
    # Cineforge approves image-to-video; this worker has no I2V model and would
    # silently fall back to text-to-video → must be rejected, not substituted.
    client, pipeline, _ = build_client(signing_key, pipeline=FakePipeline(real=True, i2v=False))
    body = gen_body(referenceImageKeys=["projects/p1/seeds/s1.png"])
    authz = cineforge_authz(workflow="diffusers.wan-2.1.i2v@1", role="i2v", model=I2V,
                            runtime=_runtime(), weights=fake_weights(ModelSpec("i2v", *I2V)))
    with client:
        r = post(client, body, mint.token(body, authz=authz))
    assert r.json()["detail"]["error"] == "AUTHZ_MISMATCH" and pipeline.calls == []


def test_i2v_route_allowed_when_worker_has_i2v(signing_key, mint):
    client, pipeline, _ = build_client(signing_key, pipeline=FakePipeline(real=True, i2v=True))
    body = gen_body(referenceImageKeys=["projects/p1/seeds/s1.png"])
    authz = cineforge_authz(workflow="diffusers.wan-2.1.i2v@1", role="i2v", model=I2V,
                            runtime=_runtime(), weights=fake_weights(ModelSpec("i2v", *I2V)))
    with client:
        r = post(client, body, mint.token(body, authz=authz))
    assert r.status_code == 200, r.text


def test_unpinned_real_model_is_unresolved(signing_key, mint):
    # Report mode so startup succeeds; the request itself must still not match.
    pipeline = FakePipeline(real=True, revision=None)
    client, pipeline, app = build_client(signing_key, mode="report", pipeline=pipeline)
    body = gen_body()
    with client:
        decision_code = []
        orig = app.state.enforcer.check
        app.state.enforcer.check = lambda **kw: decision_code.append(orig(**kw)) or decision_code[-1]
        post(client, body, mint.token(body, authz=cineforge_authz(runtime=_runtime())))
    assert decision_code[-1].code == "MODEL_UNRESOLVED"


def test_timing_fields_must_be_explicit(signing_key, mint):
    client, pipeline, _ = build_client(signing_key)
    body = json.dumps({"jobId": "grant-1", "prompt": "x", "output": OUTPUT}).encode()  # timing relies on defaults
    with client:
        r = post(client, body, mint.token(body, authz=cineforge_authz()))
    assert r.status_code == 422 and r.json()["detail"]["error"] == "TIMING_MISSING"
    assert pipeline.calls == []


def test_job_id_must_match_token_subject(signing_key, mint):
    client, pipeline, _ = build_client(signing_key)
    body = gen_body(jobId="grant-OTHER")
    with client:
        r = post(client, body, mint.token(body, sub="grant-1", authz=cineforge_authz()))
    assert r.json()["detail"]["error"] == "JOB_MISMATCH" and pipeline.calls == []


# ── /train is disabled in every mode ──────────────────────────────────────────

@pytest.mark.parametrize("mode", ["report", "enforce"])
def test_trainer_disabled(signing_key, mint, mode):
    client, _, _ = build_client(signing_key, mode=mode)
    with client:
        t = client.post("/train", json={"name": "x", "image_urls": ["u"]},
                        headers={"authorization": f"Bearer {mint.token(b'', scope='train')}"})
        s = client.get("/tasks/abc")
    assert t.status_code == 503 and t.json()["error"] == "TRAINER_DISABLED"
    assert s.status_code == 503


# ── report mode keeps the existing worker compatible (rollout R1/R2) ──────────

def test_report_mode_serves_legacy_client(signing_key):
    # Today's Cineforge sends `Bearer <RUNPOD_API_KEY>` and no jobId.
    client, pipeline, _ = build_client(signing_key, mode="report")
    body = json.dumps({"prompt": "x", "durationSec": 5.0, "width": 832, "height": 480, "fps": 16}).encode()
    with client:
        r = post(client, body, "rpa_LEGACYRUNPODKEY")
    assert r.status_code == 200 and len(pipeline.calls) == 1


def test_report_mode_legacy_client_keeps_direct_upload(signing_key):
    client, pipeline, app = build_client(signing_key, mode="report")
    body = json.dumps({"prompt": "x", "durationSec": 5.0, "width": 832, "height": 480, "fps": 16}).encode()
    with client:
        r = post(client, body, None)
    assert r.status_code == 200 and r.json()["videoKey"].startswith("_generated/")
    assert len(app.state.fake_store.legacy) == 1


# ── fail-closed startup in enforce mode ───────────────────────────────────────

def test_enforce_startup_requires_deployment_id(signing_key):
    client, _, _ = build_client(signing_key, deployment="")
    with pytest.raises(GatewayConfigError):
        with client:
            pass


def test_enforce_startup_refuses_unpinned_real_model(signing_key):
    client, _, _ = build_client(signing_key, pipeline=FakePipeline(real=True, revision="main"))
    with pytest.raises(GatewayConfigError):
        with client:
            pass


def _runtime() -> str:
    from importlib import metadata

    try:
        return f"diffusers@{metadata.version('diffusers')}"
    except metadata.PackageNotFoundError:
        return "diffusers@unknown"


# ── authentication happens before request parsing ─────────────────────────────

def test_malformed_body_without_token_is_401_not_a_schema_error(signing_key):
    client, pipeline, _ = build_client(signing_key)
    with client:
        r = client.post("/generate", content=b"{not json", headers={"content-type": "application/json"})
    assert r.status_code == 401 and r.json()["detail"]["error"] == "MISSING_TOKEN"
    assert pipeline.calls == []


def test_malformed_body_with_valid_token_is_422(signing_key, mint):
    client, pipeline, _ = build_client(signing_key)
    body = b'{"prompt": 5}'
    with client:
        r = post(client, body, mint.token(body))
    assert r.status_code == 422 and r.json()["detail"]["error"] == "INVALID_REQUEST"
    assert pipeline.calls == []


# ── report mode never lets the new I/O path break generation ─────────────────

def test_report_mode_falls_back_when_presigned_upload_fails(signing_key, mint):
    from .conftest import FakeStore

    class FailingPut(FakeStore):
        def put(self, url, local, content_type):
            raise OSError("upload refused")

    store = FailingPut()
    client, pipeline, _ = build_client(signing_key, mode="report", store=store)
    body = gen_body()
    with client:
        r = post(client, body, mint.token(body, authz=cineforge_authz()))
    assert r.status_code == 200 and r.json()["videoKey"].startswith("_generated/")
    assert len(store.legacy) == 1


def test_enforce_mode_never_falls_back_on_upload_failure(signing_key, mint):
    from .conftest import FakeStore

    class FailingPut(FakeStore):
        def put(self, url, local, content_type):
            raise OSError("upload refused")

    store = FailingPut()
    client, _, _ = build_client(signing_key, store=store)
    body = gen_body()
    with client:
        with pytest.raises(OSError):
            post(client, body, mint.token(body, authz=cineforge_authz()))
    assert store.legacy == []


# ── authz v2: LoRAs are content-addressed ─────────────────────────────────────

def test_enforce_rejects_an_unhashed_lora(signing_key, mint):
    client, pipeline, _ = build_client(signing_key)
    body = gen_body(loraKeys=[LORA], loraSha256={})
    authz = cineforge_authz(loras=((LORA, ""),))
    with client:
        r = post(client, body, mint.token(body, authz=authz))
    assert r.json()["detail"]["error"] == "LORA_UNHASHED" and pipeline.calls == []


def test_lora_hash_mismatch_at_download_is_409(signing_key, mint):
    from app.media_io import LoraIntegrityError

    class Tampered(FakePipeline):
        def generate(self, **kw):
            raise LoraIntegrityError("LORA_HASH_MISMATCH", LORA)

    client, _, app = build_client(signing_key, pipeline=Tampered())
    body = gen_body(loraKeys=[LORA])
    with client:
        r = post(client, body, mint.token(body, authz=cineforge_authz(loras=((LORA, LORA_SHA),))))
    assert r.status_code == 409 and r.json()["detail"]["error"] == "LORA_HASH_MISMATCH"
    assert app.state.fake_store.puts == []


# ── docs/38 §AV.5: the worker reports what it produced, measured ─────────────

def test_generate_returns_measured_timing_report(signing_key, mint):
    seen = {}

    def measure(path, *, requested_duration_sec, requested_fps):
        seen.update(path=path, requested=requested_duration_sec, fps=requested_fps)
        return {"kind": "video", "requestedDurationUs": 5_000_000, "actualDurationUs": 1_562_500, "frameCount": 25}

    client, _, _ = build_client(signing_key, measure=measure)
    body = gen_body()
    with client:
        r = post(client, body, mint.token(body, authz=cineforge_authz()))
    assert r.status_code == 200, r.text
    assert r.json()["timing"]["actualDurationUs"] == 1_562_500
    assert seen["path"] == "/tmp/fake.mp4"


def test_unmeasurable_output_returns_no_timing_report(signing_key, mint):
    client, _, _ = build_client(signing_key)
    body = gen_body()
    with client:
        r = post(client, body, mint.token(body, authz=cineforge_authz()))
    # Never echo the request as if it were a measurement.
    assert r.status_code == 200 and r.json()["timing"] is None
