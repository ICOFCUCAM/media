"""The voice service's HTTP contract and its Media Runtime Gateway boundary."""

from __future__ import annotations

import json
import time

import pytest

from app.gateway import GatewayConfigError
from app.server import InputRef, create_app
from app.voice_authz import voice_authz_digest

from app.gateway import ModelSpec

from .conftest import DEPLOYMENT, REV, FakeRealBackend, Store, build_client, fake_weights, make_config, placeholder_backend, sha

REF = b"reference-recording-bytes"


def authz(app, op, inputs):
    digest, err = app.state.identity.expected_authz(op, [InputRef(**i) for i in inputs])
    assert err is None
    return digest


def enroll_body(store, *, ref=REF, text="Hello there, this is my voice.", declared=None):
    store.objects["voices/u1/v1/sample.wav"] = ref
    return {
        "jobId": "g1", "voiceId": "v1", "language": "en",
        "reference": {"key": "voices/u1/v1/sample.wav", "sha256": declared or sha(ref)},
        "referenceText": text,
        "inputUrls": {"voices/u1/v1/sample.wav": store.get_url("voices/u1/v1/sample.wav")},
        "output": {"key": "voices/u1/v1/engines/qwen3-tts/g1/artifact.safetensors",
                   "uploadUrl": store.put_url("voices/u1/v1/engines/qwen3-tts/g1/artifact.safetensors")},
    }


def post(client, mint, path, body, *, scope, authz_digest=None, sub="g1", headers=None, **kw):
    raw = json.dumps(body).encode()
    tok = mint.token(raw, scope=scope, sub=sub, authz=authz_digest, **kw)
    return client.post(path, content=raw, headers={"authorization": f"Bearer {tok}", "content-type": "application/json", **(headers or {})})


def enroll(client, app, mint, store, **kw):
    body = enroll_body(store, **kw)
    return post(client, mint, "/v1/voices/enroll", body, scope="voice:enroll",
                authz_digest=authz(app, "enroll", [body["reference"]])), body


def test_livez_is_public_and_says_nothing(signing_key):
    client, *_ = build_client(signing_key)
    r = client.get("/livez")
    assert r.status_code == 200 and r.text == "ok"


def test_status_routes_need_a_token(signing_key, mint):
    client, *_ = build_client(signing_key)
    assert client.get("/health").status_code == 401
    assert client.get("/capabilities").status_code == 401
    tok = mint.token(scope="status")
    r = client.get("/capabilities", headers={"authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    caps = r.json()
    assert caps["model"] == "qwen3-tts" and caps["deploymentId"] == DEPLOYMENT and caps["gatewayMode"] == "enforce"
    assert caps["execution"] == "placeholder" and caps["realExecution"] is False
    assert caps["manifest"]["authzKind"] == "voice" and caps["manifest"]["runtime"] == "placeholder"
    assert caps["manifest"]["models"] == [{"role": "tts", "id": "Qwen/Qwen3-TTS-12Hz-1.7B-Base", "revision": REV,
                                           "pinned": True, "weights": "placeholder"}]
    assert len(caps["image"]["codeSha256"]) == 64
    assert caps["engineVersion"] == f"Qwen/Qwen3-TTS-12Hz-1.7B-Base@{REV[:12]}"
    assert caps["asyncJobs"] is True and caps["builtInVoices"] == []


def test_enroll_writes_the_artifact_through_its_one_time_url(signing_key, mint):
    client, backend, store, app = build_client(signing_key)
    r, body = enroll(client, app, mint, store)
    assert r.status_code == 200, r.text
    out = r.json()
    key = body["output"]["key"]
    assert out["artifactKey"] == key and out["artifactType"] == "speaker_embedding"
    assert out["artifactSha256"] == sha(store.objects[key]) and out["artifactBytes"] == len(store.objects[key])
    assert out["metadata"]["engine"] == "qwen3-tts" and out["metadata"]["sha256"] == out["artifactSha256"]
    assert out["realExecution"] is False and out["execution"]["mode"] == "placeholder"
    assert store.puts == [(key, "application/octet-stream")]


def test_enroll_refuses_a_reference_whose_bytes_differ_from_the_authorized_hash(signing_key, mint):
    client, _, store, app = build_client(signing_key)
    r, _ = enroll(client, app, mint, store, declared="b" * 64)
    assert r.status_code == 409 and r.json()["detail"]["error"] == "INPUT_INTEGRITY"
    assert store.puts == []


def test_a_token_for_another_input_is_an_authz_mismatch(signing_key, mint):
    client, _, store, app = build_client(signing_key)
    body = enroll_body(store)
    other = authz(app, "enroll", [{"key": "voices/u2/v9/sample.wav", "sha256": sha(REF)}])
    r = post(client, mint, "/v1/voices/enroll", body, scope="voice:enroll", authz_digest=other)
    assert r.status_code == 403 and r.json()["detail"]["error"] == "AUTHZ_MISMATCH"


def test_wrong_scope_job_deployment_and_replay_are_refused(signing_key, mint):
    client, _, store, app = build_client(signing_key)
    body = enroll_body(store)
    d = authz(app, "enroll", [body["reference"]])
    assert post(client, mint, "/v1/voices/enroll", body, scope="voice:run", authz_digest=d).json()["detail"]["error"] == "WRONG_SCOPE"
    assert post(client, mint, "/v1/voices/enroll", body, scope="voice:enroll", authz_digest=d, sub="g2").json()["detail"]["error"] == "JOB_MISMATCH"
    assert post(client, mint, "/v1/voices/enroll", body, scope="voice:enroll", authz_digest=d, aud="dep-other").json()["detail"]["error"] == "WRONG_DEPLOYMENT"
    raw = json.dumps(body).encode()
    tok = mint.token(raw, scope="voice:enroll", sub="g1", authz=d)
    h = {"authorization": f"Bearer {tok}", "content-type": "application/json"}
    assert client.post("/v1/voices/enroll", content=raw, headers=h).status_code == 200
    again = client.post("/v1/voices/enroll", content=raw, headers=h)
    assert again.status_code == 401 and again.json()["detail"]["error"] == "REPLAYED"


def test_enforce_requires_hashed_inputs_and_output_targets(signing_key, mint):
    client, _, store, app = build_client(signing_key)
    body = enroll_body(store)
    body["reference"]["sha256"] = ""
    r = post(client, mint, "/v1/voices/enroll", body, scope="voice:enroll", authz_digest=authz(app, "enroll", [body["reference"]]))
    assert r.status_code == 422 and r.json()["detail"]["error"] == "INPUT_UNHASHED"
    body = enroll_body(store)
    body.pop("output")
    r = post(client, mint, "/v1/voices/enroll", body, scope="voice:enroll", authz_digest=authz(app, "enroll", [body["reference"]]))
    assert r.status_code == 422 and r.json()["detail"]["error"] == "OUTPUT_TARGET_MISSING"


def test_invalid_bodies_are_authenticated_before_being_described(signing_key, mint):
    client, *_ = build_client(signing_key)
    r = client.post("/v1/speech", content=b"{}", headers={"content-type": "application/json"})
    assert r.status_code == 401
    r = post(client, mint, "/v1/speech", {}, scope="voice:run")
    assert r.status_code == 422 and r.json()["detail"]["error"] == "INVALID_REQUEST"


def speech_body(store, artifact_key, artifact_bytes, items, *, outputs=True):
    store.objects[artifact_key] = artifact_bytes
    return {
        "jobId": "g7", "language": "en",
        "voice": {"artifactType": "speaker_embedding", "key": artifact_key, "sha256": sha(artifact_bytes)},
        "style": {"speed": 1.1},
        "items": [{"id": i, "text": t} for i, t in items],
        "inputUrls": {artifact_key: store.get_url(artifact_key)},
        **({"outputs": {i: {"key": f"voices/u1/tmp/g7/{i}.wav", "uploadUrl": store.put_url(f"voices/u1/tmp/g7/{i}.wav")} for i, _ in items}} if outputs else {}),
    }


def test_batch_speech_speaks_every_line_in_one_job_and_keeps_the_voice_warm(signing_key, mint):
    client, backend, store, app = build_client(signing_key)
    r, body = enroll(client, app, mint, store)
    key = body["output"]["key"]
    art = store.objects[key]
    items = [("s01", "Welcome to the harbour."), ("s02", "Today the boy is missing."), ("s03", "Our story begins.")]
    sb = speech_body(store, key, art, items)
    r = post(client, mint, "/v1/speech", sb, scope="voice:run", sub="g7", authz_digest=authz(app, "speak", [sb["voice"]]))
    assert r.status_code == 200, r.text
    out = r.json()
    assert [i["id"] for i in out["items"]] == ["s01", "s02", "s03"]
    assert all(i["durationSec"] > 0 and i["sampleRate"] == 24000 for i in out["items"])
    assert out["execution"]["styleIgnored"] == ["speed"]  # Qwen3 Base has no speed control
    assert all(store.objects[f"voices/u1/tmp/g7/{i}.wav"][:4] == b"RIFF" for i, _ in items)
    gets = store.gets.count(key)
    # Second job with the same voice: served from the warm cache, not downloaded again.
    sb2 = speech_body(store, key, art, [("s04", "Again.")])
    sb2["jobId"] = "g8"
    r = post(client, mint, "/v1/speech", sb2, scope="voice:run", sub="g8", authz_digest=authz(app, "speak", [sb2["voice"]]))
    assert r.status_code == 200 and store.gets.count(key) == gets


def test_speech_needs_a_cloned_voice_and_a_known_language(signing_key, mint):
    client, _, store, app = build_client(signing_key)
    sb = {"jobId": "g7", "language": "en", "items": [{"id": "a", "text": "Hi"}], "inputUrls": {},
          "outputs": {"a": {"key": "voices/u1/tmp/g7/a.wav", "uploadUrl": store.put_url("voices/u1/tmp/g7/a.wav")}}}
    r = post(client, mint, "/v1/speech", sb, scope="voice:run", sub="g7", authz_digest=authz(app, "speak", []))
    assert r.status_code == 422 and r.json()["detail"]["error"] == "VOICE_REQUIRED"
    r, body = enroll(client, app, mint, store)
    sb = speech_body(store, body["output"]["key"], store.objects[body["output"]["key"]], [("a", "Hei")])
    sb["language"] = "no"  # Qwen3-TTS does not list Norwegian
    r = post(client, mint, "/v1/speech", sb, scope="voice:run", sub="g7", authz_digest=authz(app, "speak", [sb["voice"]]))
    assert r.status_code == 422 and r.json()["detail"]["error"] == "LANGUAGE_UNSUPPORTED"


def test_every_line_needs_its_own_output_target(signing_key, mint):
    client, _, store, app = build_client(signing_key)
    r, body = enroll(client, app, mint, store)
    sb = speech_body(store, body["output"]["key"], store.objects[body["output"]["key"]], [("a", "One."), ("b", "Two.")])
    del sb["outputs"]["b"]
    r = post(client, mint, "/v1/speech", sb, scope="voice:run", sub="g7", authz_digest=authz(app, "speak", [sb["voice"]]))
    assert r.status_code == 422 and r.json()["detail"]["error"] == "OUTPUT_TARGET_MISSING"


def test_async_jobs_return_a_task_and_are_polled_with_status_tokens(signing_key, mint):
    client, _, store, app = build_client(signing_key)
    r, body = enroll(client, app, mint, store)
    sb = speech_body(store, body["output"]["key"], store.objects[body["output"]["key"]], [("a", "One.")])
    r = post(client, mint, "/v1/speech", sb, scope="voice:run", sub="g7", authz_digest=authz(app, "speak", [sb["voice"]]),
             headers={"x-cineforge-async": "1"})
    assert r.status_code == 202
    task = r.json()["taskId"]
    for _ in range(100):
        s = client.get(f"/v1/jobs/{task}", headers={"authorization": f"Bearer {mint.token(scope='status')}"}).json()
        if s["status"] in ("done", "error"):
            break
        time.sleep(0.02)
    assert s["status"] == "done" and s["result"]["items"][0]["id"] == "a"
    assert client.get("/v1/jobs/nope", headers={"authorization": f"Bearer {mint.token(scope='status')}"}).status_code == 404


def test_similarity_scores_recordings_against_the_reference(signing_key, mint):
    client, _, store, app = build_client(signing_key)
    store.objects["voices/u1/v1/sample.wav"] = REF
    store.objects["voices/u1/bench/x.wav"] = REF
    store.objects["voices/u1/bench/y.wav"] = b"something else entirely"
    refs = [{"key": "voices/u1/v1/sample.wav", "sha256": sha(REF)}]
    cands = [{"key": "voices/u1/bench/x.wav", "sha256": sha(REF)}, {"key": "voices/u1/bench/y.wav", "sha256": sha(b"something else entirely")}]
    body = {"jobId": "g9", "reference": refs[0], "candidates": cands,
            "inputUrls": {i["key"]: store.get_url(i["key"]) for i in refs + cands}}
    r = post(client, mint, "/v1/similarity", body, scope="voice:score", sub="g9", authz_digest=authz(app, "score", refs + cands))
    assert r.status_code == 200, r.text
    scores = r.json()["scores"]
    assert scores["voices/u1/bench/x.wav"] == 1.0 and scores["voices/u1/bench/y.wav"] < 1.0
    assert r.json()["realExecution"] is False


def test_evict_drops_a_deleted_voice_from_the_warm_cache(signing_key, mint):
    client, _, store, app = build_client(signing_key)
    r, body = enroll(client, app, mint, store)
    key = body["output"]["key"]
    sb = speech_body(store, key, store.objects[key], [("a", "One.")])
    post(client, mint, "/v1/speech", sb, scope="voice:run", sub="g7", authz_digest=authz(app, "speak", [sb["voice"]]))
    assert len(app.state.voices) == 1
    raw = json.dumps({"keys": [key]}).encode()
    assert client.post("/v1/voices/evict", content=raw).status_code == 401
    r = client.post("/v1/voices/evict", content=raw, headers={"authorization": f"Bearer {mint.token(raw, scope='voice:evict')}"})
    assert r.status_code == 200 and r.json() == {"evicted": 1} and len(app.state.voices) == 0


def test_report_mode_lets_unsigned_calls_through_for_the_record(signing_key):
    client, _, store, app = build_client(signing_key, mode="report")
    body = enroll_body(store)
    r = client.post("/v1/voices/enroll", content=json.dumps(body), headers={"content-type": "application/json"})
    assert r.status_code == 200 and r.json()["artifactKey"] == body["output"]["key"]


def startup(app):
    for handler in app.router.on_startup:
        handler()


def test_enforce_refuses_to_start_with_storage_credentials(signing_key, monkeypatch):
    monkeypatch.setenv("S3_SECRET_KEY", "x")
    app = create_app(config=make_config(signing_key), backend=placeholder_backend(), fetch=Store().fetch, put=Store().put)
    with pytest.raises(GatewayConfigError, match="storage credentials"):
        startup(app)


def test_enforce_refuses_to_start_without_deployment_or_keys(signing_key):
    from app.gateway import GatewayConfig

    app = create_app(config=GatewayConfig(mode="enforce"), backend=placeholder_backend(), fetch=Store().fetch, put=Store().put)
    with pytest.raises(GatewayConfigError, match="DEPLOYMENT_ID"):
        startup(app)


def test_enforce_refuses_a_real_engine_with_an_unpinned_checkpoint(signing_key):
    app = create_app(config=make_config(signing_key), backend=FakeRealBackend(revision=None), fetch=Store().fetch, put=Store().put,
                     resolve_weights=lambda s: None)
    with pytest.raises(GatewayConfigError, match="unpinned"):
        startup(app)


def test_a_real_engine_binds_checkpoint_revision_and_weights_digest(signing_key, mint):
    client, backend, store, app = build_client(signing_key, backend=FakeRealBackend())
    body = enroll_body(store)
    weights = fake_weights(ModelSpec("tts", "Qwen/Qwen3-TTS-12Hz-1.7B-Base", REV))
    expected = voice_authz_digest(
        engine="qwen3-tts", operation="enroll", runtime="qwen-tts@0.1.1",
        models=[{"role": "tts", "id": "Qwen/Qwen3-TTS-12Hz-1.7B-Base", "revision": REV, "weights": weights}],
        inputs=[body["reference"]])
    assert authz(app, "enroll", [body["reference"]]) == expected
    r = post(client, mint, "/v1/voices/enroll", body, scope="voice:enroll", authz_digest=expected)
    assert r.status_code == 200 and r.json()["realExecution"] is True and r.json()["metadata"]["mode"] == "icl"


def test_a_real_engine_whose_weights_cannot_be_resolved_is_model_unresolved(signing_key, mint):
    client, backend, store, app = build_client(signing_key, mode="report", backend=FakeRealBackend(), resolve=lambda s: None)
    body = enroll_body(store)
    assert app.state.identity.expected_authz("enroll", [InputRef(**body["reference"])]) == (None, "MODEL_UNRESOLVED")
    # Under enforcement an unresolvable model is refused before the engine runs.
    client2, _, store2, app2 = build_client(signing_key, mode="enforce", backend=FakeRealBackend(), resolve=lambda s: "f" * 64)
    app2.state.identity._weights.clear()
    body2 = enroll_body(store2)
    r = post(client2, mint, "/v1/voices/enroll", body2, scope="voice:enroll", authz_digest="0" * 64)
    assert r.status_code == 403 and r.json()["detail"]["error"] == "MODEL_UNRESOLVED"
