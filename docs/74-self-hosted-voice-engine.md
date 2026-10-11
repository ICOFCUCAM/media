# 74 — Self-hosted Voice Engine (Qwen3-TTS, CosyVoice 3, GPT-SoVITS)

**Status:** implemented in code (2026-10-11), **not deployed, not approved**.
No image has been built yet (Docker is not available where this was written),
and no engine has run on a real GPU. Nothing speaks with these models until
you (1) deploy one, (2) register and approve its deployment, and (3) approve
its licence. Requirements: Part 4 §124–176 (especially §136, §141, §144,
§150–155, §157, §171–172); builds on docs/39 (Media Runtime Gateway), docs/51
(Voice Engine) and docs/59 (licence registry, speech cache, benchmark).

The owner has lifted the rule that kept self-hosted voice models out until
Phase 1 was complete. The licence registry and your approval still keep each
model switched off until you approve it.

## 1. What it is

Until now, CineForge cloned voices and spoke them through paid cloud services
(fal MiniMax and OpenAI). With the self-hosted Voice Engine, voices are cloned
and spoken on **CineForge's own GPU**. You pay for GPU time, not per minute of
speech (§140.3).

```
CineForge worker ──(signed, one-time grant)──▶ Voice GPU pod (one model per pod)
   │  segments the script, picks the engine        │  loads its pinned checkpoint once, keeps it warm
   │  (VOICE_ENGINES + licence registry)           │  enrolls a voice → speaker embedding / prompt audio
   │                                               │  speaks many lines in one job → one WAV per line
   ◀── WAV per line, through your own storage ─────┘  never holds storage keys: one-time URLs only
   │
   └─ masters every line outside the model (-16 LUFS, 48 kHz), caches it, delivers it
```

- **One GPU service, one API, three models.** `apps/gpu-voice` serves
  Qwen3-TTS, CosyVoice 3 or GPT-SoVITS. Each pod runs **one** of them, chosen
  when the image is built (`VOICE_ENGINE`). The API is the same whichever model
  runs: enroll a voice, speak lines (single or batch), score voice similarity,
  forget a deleted voice, health and capabilities.
- **Your voice stays yours.** Enrollment still requires the recorded consent
  (`self` or `authorised`), exactly as before. The voice's artifact (the
  model's representation of your voice) is stored in your own
  `voices/<your id>/` folder. Erasing the voice deletes it and drops it from
  the GPU's memory.
- **The same security boundary as the video GPU** (docs/39). Every call
  carries a short-lived signed token. That token is bound to this deployment,
  the action, the job, the exact request, and the approved model at its pinned
  revision. It is also bound to each file the GPU reads, by the file's
  content hash. The GPU pod holds no storage keys. In enforce mode it refuses to
  start if any storage keys are present. The gateway code is shared with the
  video worker, not copied.
- **Nothing is trusted from the pod.** Before any work, the worker checks
  that the pod runs the right engine, the right checkpoint at the right
  revision, and runs it for real. A placeholder result is always refused in
  production. After the work, every output is checked before it is used.

## 2. The three engines and their licences (checked 2026-10-11)

Read these yourself before you approve anything. The licence registry
(`packages/voice-contracts/src/licences.ts`) records these facts and gives
the router its answer.

| | Qwen3-TTS | CosyVoice 3 | GPT-SoVITS |
|---|---|---|---|
| Engine id | `qwen3-tts` | `cosyvoice-3` | `gpt-sovits` |
| Checkpoint | `Qwen/Qwen3-TTS-12Hz-1.7B-Base` | `FunAudioLLM/Fun-CosyVoice3-0.5B-2512` | `lj1995/GPT-SoVITS` (v2Pro files) |
| Code licence | **Apache-2.0** (verified: [LICENSE](https://github.com/QwenLM/Qwen3-TTS/blob/main/LICENSE), [PyPI qwen-tts 0.1.1](https://pypi.org/project/qwen-tts/0.1.1/)) | **Apache-2.0** (verified: [LICENSE](https://github.com/FunAudioLLM/CosyVoice/blob/main/LICENSE)) | **MIT** (verified: [LICENSE](https://github.com/RVC-Boss/GPT-SoVITS/blob/main/LICENSE)) |
| Weights licence | Apache-2.0 per Qwen's release statement, seen only through secondary sources. **You confirm it on the [model card](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base)** | Apache-2.0 per the model listing, seen only through secondary sources. **You confirm it on the [model card](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512)** | MIT per the repository metadata, seen through search results. **You confirm it on the [model card](https://huggingface.co/lj1995/GPT-SoVITS)** |
| Commercial use | Allowed by the licence | Allowed by the licence | Allowed by its own licence, **but see the restriction below** |
| Training data | Not disclosed ([report](https://arxiv.org/abs/2601.15621)). Your approval accepts that risk | Not itemised (about 1M hours of speech recorded in the wild, [paper](https://arxiv.org/abs/2505.17589)). Your approval accepts that risk | **Restricted.** Its required component `chinese-hubert-base` was trained on [WenetSpeech](https://github.com/TencentGameMate/chinese_speech_pretrain). The [WenetSpeech licence](https://wenet-e2e.github.io/WenetSpeech/) allows download "for non-commercial purposes" only, and the copyright of its audio stays with the original YouTube and podcast owners |
| Dependencies | Verified permissive from PyPI metadata of the pinned versions (Apache-2.0, MIT, BSD, ISC). ffmpeg and SoX are GPL programs that run separately and are not linked | Verified permissive (pinned upstream versions; pyworld MIT, wetext Apache-2.0, Matcha-TTS MIT). TensorRT and deepspeed are not installed | Verified permissive. chardet (LGPL) and tqdm (MPL-2.0) are used unmodified as libraries |
| Registry status | **Not approved.** Clears when you approve it | **Not approved.** Clears when you approve it | **Blocked for production** until a legal review is recorded in the registry. It may be run in the benchmark to evaluate it |

The registry also records two engines that are **blocked** because their
licence forbids commercial use. Neither of them is ever used:

- **Fish Speech / Fish Audio S2.** The [Fish Audio Research
  License](https://github.com/fishaudio/fish-speech/blob/main/LICENSE)
  requires a separate written licence for commercial use, explicitly
  including a hosted service or API.
- **F5-TTS.** Its [pretrained models are CC-BY-NC](https://github.com/SWivid/F5-TTS#license)
  because of the Emilia training data.

**Why the weights say "you confirm".** Hugging Face could not be reached from
the environment where this was written. The model cards were therefore not
read at the source. Nothing in this repository claims a check that was not
made. When you approve an engine, your approval records that you read the
card.

**Voice similarity scorer.** The CosyVoice 3 checkpoint includes CAM++, a
speaker-recognition model from [3D-Speaker](https://github.com/modelscope/3D-Speaker/blob/main/LICENSE)
(Apache-2.0). Qwen3-TTS has its own speaker encoder. Either can score voice
similarity for the benchmark.

## 3. How to deploy one engine on RunPod (step by step)

This section uses Qwen3-TTS as the example. For the others, replace
`qwen3-tts` / `QWEN3` with `cosyvoice-3` / `COSYVOICE` or
`gpt-sovits` / `GPTSOVITS`.

**GPU size per engine.** These are estimates. The benchmark reports the real
peak memory (`vramPeakMb`).

| Engine | Checkpoint | GPU memory | RunPod GPUs that fit |
|---|---|---|---|
| Qwen3-TTS 1.7B Base | `Qwen/Qwen3-TTS-12Hz-1.7B-Base` | about 8–12 GB in use, so pick 24 GB | RTX 4090, L4, RTX A5000 |
| Qwen3-TTS 0.6B Base (smaller worker) | `Qwen/Qwen3-TTS-12Hz-0.6B-Base`, which needs a registry change before you can approve it | about 4–6 GB, so pick 16 GB | RTX A4000, RTX 4080 |
| CosyVoice 3 0.5B | `FunAudioLLM/Fun-CosyVoice3-0.5B-2512` | about 6–10 GB, so pick 16–24 GB | RTX A4000, RTX 4090, L4 |
| GPT-SoVITS v2Pro | `lj1995/GPT-SoVITS` | about 4–6 GB, so pick 8–16 GB | RTX 3060 12 GB, RTX A4000 |

### Step 1 — Build the image (once per code change)

1. Open GitHub → **Actions** → **Build GPU voice images** → **Run workflow**.
   Choose the engine, or `all`.
2. When it finishes, open the run. The summary shows a line like:
   `Pin and approve: cineforge-gpu-voice-qwen3-tts@sha256:1a2b…`
   and the verification checks, all PASS.
3. Copy the full reference `<your-dockerhub-user>/cineforge-gpu-voice-qwen3-tts@sha256:…`.
   **Deploy only a VERIFIED digest. Never use a tag, and never `:latest`.**
   The workflow publishes only `sha-<commit>` tags.

### Step 2 — The signing keys (skip this if the video GPU already uses them)

On your computer, in the repository, run:
`pnpm --filter @cineforge/worker gateway:admin keygen`.
It prints two lines:

- `GPU_JWT_SIGNING_KEY=…` is **secret**. It goes only into the worker's
  environment on Render.
- `GPU_JWT_PUBLIC_KEYS=…` is public. It goes into each GPU pod.

### Step 3 — Pin the model revision

1. Open the model page, for example <https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base>.
2. **Read the licence on the card** (the right-hand side of the page and the
   README). This is the check your approval records.
3. Click **Files and versions** → **History**, and copy the newest commit's
   full id. It is 40 characters, letters `a–f` and digits. This is the
   **revision**.

### Step 4 — Create the pod on RunPod

1. Go to RunPod → **Pods** → **Deploy**. Pick a GPU from the table above.
2. **Container image:** paste the digest reference from Step 1
   (`…/cineforge-gpu-voice-qwen3-tts@sha256:…`).
3. **Container disk:** 30 GB.
   **Volume:** 40 GB, mounted at `/root/.cache/huggingface`. The model
   downloads once and survives restarts.
4. **Expose HTTP port:** `8000`.
5. **Environment variables:**

   | Name | Value |
   |---|---|
   | `VOICE_MODEL_REVISION` | the 40-character revision from Step 3 |
   | `DEPLOYMENT_ID` | a name you choose, for example `dep-voice-qwen3-1` |
   | `GPU_JWT_PUBLIC_KEYS` | the public line from Step 2 |
   | `GATEWAY_MODE` | `report` for now (you switch to `enforce` in Step 6) |
   | `VOICE_MODEL_REPO` | only if you use another checkpoint (otherwise leave it out) |

   **Never** add S3, AWS, OpenAI or any other keys to the pod. The engine
   itself is fixed by the image. Do not set `CINEFORGE_PLACEHOLDER`.
6. Deploy. The first start downloads the model, which takes a few minutes.
   Then open `https://<pod id>-8000.proxy.runpod.net/livez`. It should say
   `ok`.

### Step 5 — Tell the worker about it

In Render → worker → **Environment**, add:

| Name | Value |
|---|---|
| `VOICE_GPU_QWEN3_URL` | `https://<pod id>-8000.proxy.runpod.net` |
| `VOICE_GPU_QWEN3_REVISION` | the same 40-character revision as on the pod |
| `GPU_JWT_SIGNING_KEY` | the secret line from Step 2 (if not already set) |
| `RUNPOD_API_KEY` | your RunPod API key (if not already set). It proves which image the pod runs |

Do **not** add `qwen3-tts` to `VOICE_ENGINES` yet.

### Step 6 — Register, approve and enforce the deployment

On your computer, with `DATABASE_URL`, `GPU_JWT_SIGNING_KEY`, `RUNPOD_API_KEY`
and `GATEWAY_OPERATOR=<your name>` set, run:

```
pnpm --filter @cineforge/worker gateway:admin register --id dep-voice-qwen3-1 --model qwen3-tts \
    --url https://<pod id>-8000.proxy.runpod.net --pod <pod id>
pnpm --filter @cineforge/worker gateway:admin approve  --id dep-voice-qwen3-1 \
    --image <your-dockerhub-user>/cineforge-gpu-voice-qwen3-tts@sha256:<digest>
```

`approve` refuses the deployment in each of these cases:

- RunPod reports a different image.
- The pod reports another engine or deployment id.
- The model is not pinned, or its weights digest is unresolved.

Then edit the pod: set `GATEWAY_MODE=enforce` and restart it. Then run:

```
pnpm --filter @cineforge/worker gateway:admin enforce --id dep-voice-qwen3-1
```

From now on, the pod refuses anything that is not a valid, signed grant for
exactly this deployment.

### Step 7 — Benchmark it on your own voice (before approving the licence)

See §4. Run it with `--evaluate --enroll`.

### Step 8 — Approve the licence (only if you accept it)

If you read the model card in Step 3 and you accept the licence and the
undisclosed training data, add to the worker's environment:

```
VOICE_MODEL_APPROVALS=qwen3-tts@Qwen/Qwen3-TTS-12Hz-1.7B-Base=<Your Name>:2026-10-12
VOICE_ENGINES=qwen3-tts:100,fal-minimax:90,openai-tts:80
```

Several approvals are separated by commas. An approval names the exact
checkpoint. An approval for any other checkpoint does not count. The code
never sets this variable. Only you do.

After the restart, the Capability Registry shows **voice cloning: qwen3-tts
(experimental)**, and new voice enrollments use Qwen3-TTS.

Voices you already have are enrolled with fal, not with Qwen3-TTS. Until you
enroll them again (or run the benchmark with `--enroll`):

- a `/v1` speech job for such a voice fails and asks you to enroll it again;
- a film speaks that character in a built-in voice and adds a
  `VOICE_SUBSTITUTED` notice that says why.

A cloned voice is never silently spoken by another model. Built-in narrator
voices keep coming from the cloud engines, because the self-hosted engines
have none.

**GPT-SoVITS** stays blocked even with an approval, because of the
WenetSpeech restriction (§2). To change that, a legal review must be
recorded in its registry entry, which is a code change.

## 4. Benchmark on your own voice

```
pnpm --filter @cineforge/worker voice:bench --voice <your voice id> \
    --engines qwen3-tts,cosyvoice-3,fal-minimax --evaluate --enroll --out bench.json --record
```

- `--voice` is one of your own voices. It must be READY and have recorded
  consent.
- `--enroll` enrolls that same recording with each self-hosted engine it is
  not yet enrolled with. The artifact lands in your `voices/` folder and is
  erased with the voice.
- `--evaluate` runs engines that are configured but not yet approved,
  provided their licence allows commercial use and nothing blocks them. The
  report marks them **evaluation only**. Blocked models (Fish, F5) never run.
- **Voice similarity.** Set `VOICE_SIMILARITY_ENGINE=cosyvoice-3` (or
  `qwen3-tts`) to a configured deployment. Every engine's speech is then
  compared with your reference recording by that one speaker encoder (cosine
  similarity, higher is closer). Without it, similarity is reported as "not
  measured".
- **What else is measured:**
  - pronunciation, as word error rate, transcribed back with OpenAI (needs
    `OPENAI_API_KEY`);
  - speed, as real-time factor;
  - long-form consistency, as the spread of loudness and pace;
  - GPU memory peak;
  - licence status.
- **Naturalness** still needs human listeners and is reported as not
  measured.
- **Scripts in a language an engine does not speak are listed, not run.**
  Qwen3-TTS and CosyVoice 3 do not speak Norwegian. GPT-SoVITS here speaks
  English, Japanese and Korean only.
- `--record` writes the run to `benchmark_runs` (suite `voice`).

## 5. Configuration reference

**Worker (Render):**

| Variable | Meaning |
|---|---|
| `VOICE_GPU_QWEN3_URL`, `VOICE_GPU_COSYVOICE_URL`, `VOICE_GPU_GPTSOVITS_URL` | the deployment of each engine |
| `VOICE_GPU_QWEN3_REVISION`, `VOICE_GPU_COSYVOICE_REVISION`, `VOICE_GPU_GPTSOVITS_REVISION` | pinned checkpoint revision (40 hex characters). Must equal the pod's |
| `VOICE_GPU_QWEN3_MODEL`, … (optional) | checkpoint repository, if it is not the registry's |
| `VOICE_ENGINES` | add `qwen3-tts:100` (and others) **after** approval |
| `VOICE_MODEL_APPROVALS` | your approvals: `engine@checkpoint=name:YYYY-MM-DD,…` |
| `VOICE_SIMILARITY_ENGINE` | benchmark scorer: `qwen3-tts` or `cosyvoice-3` |
| `VOICE_GPU_TIMEOUT_MS` | longest one GPU job may take (default 30 min) |
| `VOICE_GPU_BATCH_MAX` | lines per GPU job (default 100) |
| `VOICE_GPU_ALLOW_PLACEHOLDER` | `1` only for local wiring tests. **Never in production** |
| `GPU_JWT_SIGNING_KEY`, `RUNPOD_API_KEY`, `GPU_GATEWAY_MODE` | as for the video GPU (docs/39) |

**Voice pod (RunPod):**

| Variable | Meaning |
|---|---|
| `VOICE_ENGINE` | fixed by the image (`qwen3-tts`, `cosyvoice-3` or `gpt-sovits`) |
| `VOICE_MODEL_REVISION` | pinned checkpoint revision (required under enforce) |
| `VOICE_MODEL_REPO` | checkpoint repository (default per engine) |
| `DEPLOYMENT_ID`, `GPU_JWT_PUBLIC_KEYS`, `GATEWAY_MODE` | gateway (docs/39) |
| `QWEN3_BATCH` (default 4), `QWEN3_ATTN_IMPLEMENTATION` (default `sdpa`) | Qwen3 tuning |
| `VOICE_CACHE_SIZE` (default 32), `VOICE_MAX_BATCH_ITEMS` (default 500) | warm voices; lines per job |

## 6. What is real and what is limited

**Real, and tested without a GPU:**

- the service API, the async jobs, and the warm voice cache;
- the gateway checks (shared code), the voice authorization digest, and the
  input integrity check;
- the cross-language token and digest contract (TypeScript ↔ Python);
- the worker adapter through the real Gateway Authority, including:
  - enroll, batch speech, similarity and erasure;
  - refusing a placeholder pod, a wrong checkpoint or a wrong output key;
- licence gating, routing and the benchmark's evaluation, enrollment and
  similarity paths;
- the Capability Registry reporting.

**Not yet proven, so treat it as untested until the first real run:**

- **No image has been built and no model has run on a GPU.** The
  model-calling code follows each project's documented API at the pinned
  commit (Qwen `create_voice_clone_prompt` / `generate_voice_clone`; CosyVoice
  `frontend_zero_shot` / `inference_zero_shot`; GPT-SoVITS `TTS.run`).
  Library versions were pinned without a test install, so the first CI
  build may need pin adjustments.
- **Transitive Python dependencies** are fixed by the image digest you
  approve, not by a lock file.
- **Enrollment has no transcript of your recording yet.** Each engine
  therefore uses its transcript-free mode, which is lower quality:
  - Qwen3: speaker embedding only;
  - CosyVoice: cross-lingual;
  - GPT-SoVITS: reference-free.

  The API accepts a transcript (`referenceText`), but the enrollment job
  does not produce one.
- **Not wired:** emotion or instruction control and streaming. Qwen3 Base has
  no speed control. GPT-SoVITS has no Chinese or Cantonese in this image (the
  G2PW model is not downloaded) and no per-voice fine-tuning (no adapter
  weights).
- **Film voices and dubs** call the engine line by line, with the model kept
  warm. Only `/v1` voice jobs use the one-job batch.
- **GPU sizes in §3 are estimates.** The benchmark reports the real peak.
- **Licences.** The weights' licences must be confirmed by you on the model
  cards. GPT-SoVITS is blocked pending a legal review.
