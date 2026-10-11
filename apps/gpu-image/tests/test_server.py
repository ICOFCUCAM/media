"""The service through the real FastAPI app: gateway contract, registry-only
execution, one-time media I/O, async jobs and honest execution reports."""
from __future__ import annotations

import hashlib
import json
import time

import pytest

from app.gateway import GatewayConfigError, authz_digest
from app.gateway.authz import TimingRequest
from app.png import png_size
from app.registry import load_registry
from app.runtime import ComfyRuntime, UnavailableRuntime

from .conftest import PINS, FakeRealRuntime, FakeStore, build_client

OUTPUT = {"imageKey": "projects/p1/seeds/s1.png", "imageUploadUrl": "https://store.example/put/s1?sig=1"}
LORA = "projects/p1/identities/c1/v1/qwen-lora.safetensors"


def body(**over) -> bytes:
    b = {"jobId": "grant-1", "workflow": {"id": "cineforge.still.t2i", "version": 1}, "prompt": "a lighthouse at dusk",
         "seed": 7, "width": 512, "height": 288, "output": OUTPUT, **over}
    for k in [k for k, v in b.items() if v is None]:
        b.pop(k)
    keys = [*(b.get("referenceImageKeys") or []), *(b.get("loraKeys") or [])]
    if keys and "inputUrls" not in b:
        b["inputUrls"] = {k: f"https://store.example/get/{k}?sig=1" for k in keys}
    return json.dumps(b).encode()


def cineforge_authz(app, *, wf=("cineforge.still.t2i", 1), width=512, height=288, loras=()) -> str:
    """The digest Cineforge signs, computed from what the pod reports in /capabilities."""
    ident = app.state.identity
    w = app.state.registry.get(*wf)
    return authz_digest(workflow=f"{w.ref}#{w.sha256}", runtime=ident.runtime.runtime_id(), models=ident.models_for(w),
                        loras=[{"key": k, "sha256": h} for k, h in loras],
                        timing=TimingRequest(duration_us=0, fps=0, width=width, height=height))


def post(client, data: bytes, token: str | None, **headers):
    h = {"content-type": "application/json", **headers}
    if token:
        h["authorization"] = f"Bearer {token}"
    return client.post("/images", content=data, headers=h)


PROTECTED = [("GET", "/health"), ("GET", "/capabilities"), ("POST", "/images"), ("GET", "/images/jobs/x")]


@pytest.mark.parametrize("method,path", PROTECTED)
@pytest.mark.parametrize("token", [None, "garbage", "expired"])
def test_unauthenticated_requests_are_rejected(signing_key, mint, method, path, token):
    client, runtime, app = build_client(signing_key)
    with client:
        data = body() if path == "/images" else b""
        if token == "expired":
            token = mint.token(data, scope="image:run status", iat=1_000_000)
        h = {"content-type": "application/json"}
        if token:
            h["authorization"] = f"Bearer {token}"
        r = client.request(method, path, content=data, headers=h)
    assert r.status_code == 401, r.text
    assert app.state.fake_store.puts == []


def test_livez_is_public_and_discloses_nothing(signing_key):
    client, _, _ = build_client(signing_key)
    with client:
        r = client.get("/livez")
    assert r.status_code == 200 and r.text == "ok"


def test_authorized_still_is_written_only_to_the_granted_url(signing_key, mint):
    client, _, app = build_client(signing_key)
    data = body()
    with client:
        r = post(client, data, mint.token(data, authz=cineforge_authz(app)))
    assert r.status_code == 200, r.text
    out = r.json()
    url, ctype, png = app.state.fake_store.puts[0]
    assert (url, ctype) == (OUTPUT["imageUploadUrl"], "image/png") and len(app.state.fake_store.puts) == 1
    assert out["imageKey"] == OUTPUT["imageKey"] and out["imageBytes"] == len(png)
    assert out["sha256"] == hashlib.sha256(png).hexdigest() and png_size(png) == (512, 288)
    assert out["seed"] == 7 and out["workflow"]["id"] == "cineforge.still.t2i" and len(out["workflow"]["sha256"]) == 64
    # Placeholder mode never claims a real model ran.
    assert out["realExecution"] is False and out["execution"]["mode"] == "placeholder" and out["runtime"] == "placeholder"


def test_unknown_workflow_is_refused_after_authentication(signing_key, mint):
    client, _, app = build_client(signing_key)
    data = body(workflow={"id": "cineforge.still.t2i", "version": 99})
    with client:
        assert post(client, data, None).status_code == 401
        r = post(client, data, mint.token(data, authz="0" * 64))
    assert r.status_code == 404 and r.json()["detail"]["error"] == "WORKFLOW_UNKNOWN"
    assert app.state.fake_store.puts == []


def test_unknown_workflow_is_refused_in_report_mode_too(signing_key):
    client, _, app = build_client(signing_key, mode="report")
    data = body(workflow={"id": "user.custom-graph", "version": 1})
    with client:
        r = post(client, data, None)
    assert r.status_code == 404 and app.state.fake_store.puts == []


def test_a_caller_cannot_send_a_graph(signing_key, mint):
    client, _, app = build_client(signing_key)
    data = json.dumps({**json.loads(body()), "graph": {"1": {"class_type": "ExecutePython", "inputs": {}}}}).encode()
    with client:
        r = post(client, data, mint.token(data, authz=cineforge_authz(app)))
    assert r.status_code == 422 and r.json()["detail"]["error"] == "INVALID_REQUEST"


@pytest.mark.parametrize("change", [
    {"wf": ("cineforge.still.ref", 1)},  # another workflow than the one signed
    {"width": 1024},  # another size
])
def test_authz_binds_workflow_and_size(signing_key, mint, change):
    client, _, app = build_client(signing_key)
    data = body()
    with client:
        r = post(client, data, mint.token(data, authz=cineforge_authz(app, **change)))
    assert r.status_code == 403 and r.json()["detail"]["error"] == "AUTHZ_MISMATCH"


def test_a_video_token_cannot_draw_a_still(signing_key, mint):
    client, _, app = build_client(signing_key)
    data = body()
    with client:
        r = post(client, data, mint.token(data, scope="video:run", authz=cineforge_authz(app)))
    assert r.status_code == 403 and r.json()["detail"]["error"] == "WRONG_SCOPE"


def test_body_and_job_binding(signing_key, mint):
    client, _, app = build_client(signing_key)
    data = body()
    with client:
        r1 = post(client, body(prompt="something else"), mint.token(data, authz=cineforge_authz(app)))
        r2 = post(client, data, mint.token(data, sub="grant-2", authz=cineforge_authz(app)))
    assert r1.json()["detail"]["error"] == "BODY_MISMATCH" and r2.json()["detail"]["error"] == "JOB_MISMATCH"


def test_output_target_is_required_in_every_mode(signing_key, mint):
    for mode in ("enforce", "report"):
        client, _, app = build_client(signing_key, mode=mode)
        data = body(output=None)
        with client:
            r = post(client, data, mint.token(data, authz=cineforge_authz(app)))
        assert r.status_code == 422 and r.json()["detail"]["error"] == "OUTPUT_TARGET_MISSING"


def test_reference_workflow_reads_inputs_only_from_one_time_urls(signing_key, mint):
    runtime_registry = load_registry()
    rt = FakeRealRuntime(runtime_registry)
    client, _, app = build_client(signing_key, runtime=rt, registry=runtime_registry)
    refs = ["projects/p1/wardrobe/w1.png", "projects/p1/characters/c1/portrait.png"]
    data = body(workflow={"id": "cineforge.still.ref", "version": 1}, referenceImageKeys=refs)
    with client:
        r = post(client, data, mint.token(data, authz=cineforge_authz(app, wf=("cineforge.still.ref", 1))))
        missing = body(workflow={"id": "cineforge.still.ref", "version": 1}, referenceImageKeys=refs, inputUrls={})
        r2 = post(client, missing, mint.token(missing, authz=cineforge_authz(app, wf=("cineforge.still.ref", 1))))
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["realExecution"] is True and out["execution"]["referencesUsed"] == 2 and out["runtime"].startswith("comfyui@")
    g = rt.graphs[0]
    assert sorted(v["inputs"]["image"] for v in g.values() if v["class_type"] == "LoadImage") == [f"cf_{rt.cleaned[0]}_ref0.png", f"cf_{rt.cleaned[0]}_ref1.png"]
    assert "image3" not in g["12"]["inputs"]
    assert out["models"] and all(m["weights"] for m in out["models"])
    assert r2.status_code == 422 and r2.json()["detail"]["error"] == "INPUT_URL_MISSING"


def test_lora_bytes_must_match_the_authorized_hash(signing_key, mint):
    store = FakeStore()
    client, _, app = build_client(signing_key, store=store)
    good = b"lora-bytes"
    url = f"https://store.example/get/{LORA}?sig=1"
    store.inputs[url] = good
    for sha, status in ((hashlib.sha256(good).hexdigest(), 200), ("ab" * 32, 409)):
        data = body(loraKeys=[LORA], loraSha256={LORA: sha})
        with client:
            r = post(client, data, mint.token(data, authz=cineforge_authz(app, loras=((LORA, sha),))))
        assert r.status_code == status, r.text
    data = body(loraKeys=[LORA])
    with client:
        r = post(client, data, mint.token(data, authz=cineforge_authz(app, loras=((LORA, ""),))))
    assert r.json()["detail"]["error"] == "LORA_UNHASHED"


def test_invalid_slot_values_are_refused_before_any_work(signing_key, mint):
    client, _, app = build_client(signing_key)
    data = body(width=1000)
    with client:
        r = post(client, data, mint.token(data, authz=cineforge_authz(app, width=1000)))
    assert r.status_code == 422 and r.json()["detail"]["error"] == "INVALID_PARAMETERS"
    assert app.state.fake_store.puts == []


def test_async_job_then_poll(signing_key, mint):
    client, _, app = build_client(signing_key)
    data = body()
    with client:
        r = post(client, data, mint.token(data, authz=cineforge_authz(app)), **{"x-cineforge-async": "1"})
        assert r.status_code == 202
        task = r.json()["taskId"]
        for _ in range(100):
            s = client.get(f"/images/jobs/{task}", headers={"authorization": f"Bearer {mint.token(b'', scope='status')}"}).json()
            if s["status"] in ("done", "error"):
                break
            time.sleep(0.02)
        unknown = client.get("/images/jobs/nope", headers={"authorization": f"Bearer {mint.token(b'', scope='status')}"})
    assert s["status"] == "done" and s["result"]["imageKey"] == OUTPUT["imageKey"]
    assert unknown.status_code == 404


def test_unavailable_runtime_refuses_and_never_returns_a_placeholder(signing_key, mint):
    reg = load_registry()
    client, _, app = build_client(signing_key, runtime=UnavailableRuntime(reg, "CUDA_UNAVAILABLE", PINS), registry=reg)
    data = body()
    with client:
        r = post(client, data, mint.token(data, authz=cineforge_authz(app)))
        caps = client.get("/capabilities", headers={"authorization": f"Bearer {mint.token(b'', scope='status')}"}).json()
    assert r.status_code == 503 and r.json()["detail"]["error"] == "CUDA_UNAVAILABLE"
    assert caps["execution"] == "unavailable" and caps["realExecution"] is False and app.state.fake_store.puts == []


def test_unresolved_weights_cannot_be_authorized(signing_key, mint):
    reg = load_registry()
    client, _, app = build_client(signing_key, runtime=FakeRealRuntime(reg, weights=False), registry=reg)
    data = body()
    with client:
        r = post(client, data, mint.token(data, authz="0" * 64))
    assert r.status_code == 403 and r.json()["detail"]["error"] == "MODEL_UNRESOLVED"


def test_capabilities_report_workflow_hashes_manifest_and_code(signing_key, mint):
    from pathlib import Path

    from app.code_digest import code_digest

    client, _, app = build_client(signing_key, runtime=FakeRealRuntime(load_registry()))
    with client:
        c = client.get("/capabilities", headers={"authorization": f"Bearer {mint.token(b'', scope='status')}"}).json()
    reg = app.state.registry
    assert c["registrySha256"] == reg.sha256 and c["deploymentId"] == "dep-comfy-test-1" and c["gatewayMode"] == "enforce"
    assert {(w["id"], w["sha256"]) for w in c["workflows"]} == {(w.id, w.sha256) for w in reg.workflows.values()}
    m = c["manifest"]
    assert m["authzVersion"] == 2 and m["runtime"] == "comfyui@8ff6dc384ba5c410266b40e137799e049459d4f2"
    assert all(x["pinned"] and x["weights"] for x in m["models"])
    assert {w["id"] for w in m["workflows"]} == {"cineforge.still.t2i", "cineforge.still.ref"}
    import app as pkg

    assert c["image"]["codeSha256"] == code_digest(Path(pkg.__file__).resolve().parent)
    assert c["licences"]["qwen-image.diffusion"]["licence"] == "Apache-2.0"


def test_enforce_refuses_to_start_with_storage_credentials(signing_key, monkeypatch):
    monkeypatch.setenv("S3_SECRET_KEY", "permanent-secret")
    client, _, _ = build_client(signing_key)
    with pytest.raises(GatewayConfigError):
        with client:
            pass


def test_enforce_refuses_to_start_with_unpinned_models(signing_key, tmp_path):
    reg = load_registry()
    rt = ComfyRuntime(reg, comfy_dir=str(tmp_path), base=str(tmp_path), env={}, cuda=lambda: True)
    client, _, _ = build_client(signing_key, runtime=rt, registry=reg)
    with pytest.raises(GatewayConfigError, match="unpinned"):
        with client:
            pass


def test_report_mode_starts_unpinned_but_the_runtime_is_unavailable(signing_key, mint, tmp_path):
    reg = load_registry()
    rt = ComfyRuntime(reg, comfy_dir=str(tmp_path), base=str(tmp_path), env={}, cuda=lambda: True)
    client, _, _ = build_client(signing_key, mode="report", runtime=rt, registry=reg)
    with client:
        h = client.get("/health").json()
    assert h["execution"] == "unavailable" and h["unavailableReason"] == "MODEL_UNPINNED"
