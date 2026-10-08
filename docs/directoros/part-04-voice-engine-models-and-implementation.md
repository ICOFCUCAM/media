# Part 4 — Voice Engine: model choice, licensing, model-independent architecture, implementation specification

Received 2026-10-08. Recorded in full, in the author's order. Section numbers
continue from Part 3 (which ended at 129), so every requirement ID across all
parts is unique (`DOS-<section>.<n>`). The text itself is not shortened.

Omitted from the record, and only this: one advertisement that came with the
pasted text ("Talkpal — Speak confidently using our AI language tutor …"). It
is not part of the specification. The two comparison tables arrived as
tab-separated text and are laid out as Markdown tables with the same cells.
"GitHub" / "Hugging Face" after a sentence marks where the original cited a
source; those markers are kept.

The part has five movements, each opened by the author's message:

- **A. §130–137:** which voice-cloning models exist, and a shortlist.
- **B. §138–141:** "are the models free?" — free to run vs free for commercial use.
- **C. §142:** "ok" / "ok" — the direction is set: Qwen3-TTS first, CosyVoice 3
  and GPT-SoVITS as fallbacks, behind a pluggable Voice Engine.
- **D. §143–156:** "the next sensible step is to design the CineForge Voice
  Engine architecture around a model-independent API" — the architecture (14 points).
- **E. §157–176:** "go next" — the Voice Engine implementation specification
  (19 points) and the end result.

---

# A. The models

## 130. The shortlist — licensing differs substantially

**DOS-130.1** There are quite a few, and the choice matters a lot for CineForge
because **licensing differs substantially**. For what the author described —
clone your own voice from a reference recording and then read arbitrary scripts
naturally — these are at the top of the list:

| Model | Voice cloning | Quality | Multilingual | Commercial suitability* | My view |
|---|---|---|---|---|---|
| Qwen3-TTS | ✅ | Excellent | ✅ | Promising | ⭐⭐⭐⭐⭐ |
| CosyVoice 3 | ✅ | Excellent | ✅ | Check exact model license | ⭐⭐⭐⭐⭐ |
| Fish Speech S2 | ✅ | Excellent | ✅ 80+ | License restrictive | ⭐⭐⭐⭐ |
| GPT-SoVITS | ✅ | Very good | ✅ | Check exact license | ⭐⭐⭐⭐ |
| F5-TTS | ✅ | Excellent | Limited/varies | ❌ Public weights NC | ⭐⭐⭐⭐ |
| XTTS-v2 | ✅ | Very good | ~17 languages | License needs review | ⭐⭐⭐⭐ |
| OpenVoice | ✅ | Good | ✅ | Model/version dependent | ⭐⭐⭐ |
| StyleTTS2 | With adaptation | Excellent | More limited | Model/data dependent | ⭐⭐⭐ |

**DOS-130.2** \*For a commercial CineForge service, **don't treat the table as
legal clearance**; you need to verify the **exact checkpoint/weights and
dependencies you ship**.

## 131. Qwen3-TTS — the one to investigate first

**DOS-131.1** This is particularly interesting for the architecture. It has a
**voice-cloning mode** rather than requiring a separate model to be trained for
every user. The architecture can take a reference voice and generate new speech
in that speaker's voice.

**DOS-131.2** For the system:

```
Your voice recording
        ↓
Speaker representation
        ↓
Qwen3-TTS Talker
        ↑
        │
Your script
        ↓
Generated speech
```

This is very close to the "Clone Talker" idea the author was asking about.

**DOS-131.3** There are also different model sizes, so you can potentially have a
**smaller/cheaper worker and a higher-quality worker**.

## 132. CosyVoice 3

**DOS-132.1** Another one to take very seriously. The CosyVoice project currently
recommends **Fun-CosyVoice3-0.5B**, alongside CosyVoice2 and earlier models. It is
designed as a multilingual speech-generation system and supports
deployment/inference infrastructure including **vLLM**. GitHub

**DOS-132.2** For CineForge:

```
VOICE ENGINE
     │
     └── CosyVoice 3
           │
           ├── Voice cloning
           ├── Multilingual speech
           ├── Streaming
           └── GPU inference
```

**DOS-132.3** The relatively small **0.5B** model is particularly interesting
because you don't necessarily need an enormous GPU just to produce narration.

## 133. Fish Speech / Fish Audio S2

**DOS-133.1** Fish Speech is technically very impressive. The current **S2 Pro** is
described as a **4B-parameter** multilingual TTS model, trained on more than
**10 million hours** of audio and supporting fine-grained emotional/prosody
control and multi-speaker/multi-turn generation. GitHub

**DOS-133.2** Be cautious for the commercial architecture because of licensing.
The current Fish Speech repository states that its code/model weights are under
the **Fish Audio Research License**. GitHub So:

> Excellent technology ≠ automatically suitable for your commercial product.

## 134. GPT-SoVITS

**DOS-134.1** One of the better-known voice-cloning architectures. Its approach
separates parts of the speech-generation problem:

```
Text
 ↓
GPT
 ↓
Semantic/prosody representation
 ↓
SoVITS
 ↓
Voice/timbre
 ↓
Audio
```

**DOS-134.2** It can work with relatively small amounts of reference/training data
and has a large ecosystem. Current implementations include **V2/V2Pro/V3/V4**
variants. GitHub It's definitely worth testing.

## 135. F5-TTS

**DOS-135.1** F5-TTS is technically excellent and uses a **flow-matching**
approach. Its code is **MIT** licensed. GitHub

**DOS-135.2** But the publicly released pretrained weights are currently
**CC-BY-NC**, meaning **non-commercial**. GitHub So don't build the commercial
CineForge Voice Engine around the standard F5-TTS checkpoint **without obtaining
appropriate rights**.

## 136. What to actually do — pluggable models, benchmark with your own voice

**DOS-136.1** Don't pick one model immediately. Build the architecture so that
models are **pluggable**:

```
                 CINEFORGE VOICE ENGINE
                         │
                  Voice API / Gateway
                         │
                   Model Router
                         │
          ┌──────────────┼──────────────┐
          │              │              │
       Qwen3-TTS     CosyVoice       GPT-SoVITS
          │              │              │
          └──────────────┼──────────────┘
                         │
                    GPU Worker
                         │
                    Audio Master
                         │
                    48 kHz WAV
```

**DOS-136.2** Then **benchmark them using your actual voice**. Test the same:

- 30-second narration
- 2-minute narration
- 10-minute narration
- emotional script
- documentary script
- conversational script
- Norwegian
- English
- French

**DOS-136.3** And measure:

```
voice similarity + pronunciation + naturalness + long-form consistency + generation speed + VRAM + licensing
```

## 137. Initial shortlist

**DOS-137.1** If the goal is specifically:

> "I want CineForge to clone my voice and let me read any script with it."

start with:

1. Qwen3-TTS
2. CosyVoice 3
3. GPT-SoVITS
4. Fish Speech S2 — technically interesting, but licensing needs particular attention.

**DOS-137.2** Do not make F5-TTS the commercial production choice using its
standard public weights, because of the current non-commercial weight license.
GitHub

**DOS-137.3** This is where the idea becomes much less "hard" than the author was
originally told: **we don't need to invent the Talker**. Build your own Voice
Engine around a suitable existing Talker, and later **replace the Talker without
rebuilding CineForge**.

---

# B. "Are the models free?"

## 138. Free to run vs free for commercial use

**DOS-138.1** Yes — many of the models are free to download and run, but **"free"
and "free for commercial use" are different things**. For building a commercial
CineForge Voice Engine, separate them like this:

| Model | Free to run? | Commercial use | My assessment |
|---|---|---|---|
| Qwen3-TTS | ✅ Yes | ✅ Appears commercially usable under its applicable license | Best candidate |
| CosyVoice | ✅ Yes | ✅ Generally permissive software/model licensing, verify exact checkpoint | Excellent candidate |
| GPT-SoVITS | ✅ Yes | ✅ MIT software license; verify individual model/weights | Very interesting |
| Fish Speech S2 | ✅ Yes | ❌ Requires commercial license | Avoid for now |
| F5-TTS | ✅ Yes | ⚠️ Public pretrained weights have non-commercial restrictions | Not my first commercial choice |
| XTTS-v2 | ✅ Yes | ⚠️ Must check Coqui/model license for your exact deployment | Worth testing |
| OpenVoice | ✅ Yes | ⚠️ Depends on version/model components | Worth testing |

## 139. The licensing findings

**DOS-139.1** The current licensing was checked rather than relying on older
information.

**DOS-139.2** GPT-SoVITS's **software repository is MIT licensed**, which permits
commercial use, modification, distribution, etc., subject to the MIT terms.
GitHub

**DOS-139.3** Fish Speech is different. Its current Research License explicitly
says research/non-commercial use is free, but **commercial use requires a separate
written license from Fish Audio**. That specifically includes using it in a
**hosted product/API** such as the system being planned. GitHub

**DOS-139.4** Qwen3-TTS is particularly interesting because its Qwen TTS package is
**Apache-2.0** licensed. Hugging Face

## 140. Start order and the abstraction

**DOS-140.1** Start with:

🥇 Qwen3-TTS
🥈 CosyVoice
🥉 GPT-SoVITS

**DOS-140.2** Then build your own abstraction:

```
                 CINEFORGE VOICE ENGINE
                         │
                    Voice API
                         │
                   Model Router
                         │
          ┌──────────────┼──────────────┐
          │              │              │
      Qwen3-TTS      CosyVoice      GPT-SoVITS
          │              │              │
          └──────────────┼──────────────┘
                         │
                    GPU Worker
                         │
                    Audio Master
                         │
                    CineForge
```

**DOS-140.3** That means you **don't pay per generated minute** to ElevenLabs or
another hosted voice provider. You pay for your own GPU infrastructure instead.

**DOS-140.4** And you can clone your own voice, save your speaker profile, and then
generate **unlimited scripts subject to your own compute capacity**.

## 141. The caveat, and where to focus evaluation

**DOS-141.1** Even when the model license permits commercial use, you still need to
check the **exact model checkpoint, training-data terms, dependencies, and
voice-consent/legal requirements** before shipping it commercially.

**DOS-141.2** If the objective is "I want the best free/open model that I can
legally put inside CineForge and use commercially", focus the next evaluation
specifically on **Qwen3-TTS vs CosyVoice 3 vs GPT-SoVITS**, rather than looking at
all the models.

---

# C. "ok" / "ok"

## 142. The direction is set

**DOS-142.1** For CineForge, make **Qwen3-TTS the first model to benchmark**, with
**CosyVoice 3 and GPT-SoVITS as fallbacks**.

**DOS-142.2** The next sensible step is to design the CineForge Voice Engine
architecture around a **model-independent API**, so models can change later
without changing CineForge itself.

**DOS-142.3** Clear direction: **CineForge Voice Engine, with Qwen3-TTS as the
first implementation and a pluggable architecture for CosyVoice/GPT-SoVITS
later.**

---

# D. The model-independent Voice Engine architecture

> Author: "the next sensible step is to design the CineForge Voice Engine
> architecture around a model-independent API, so you can change models later
> without changing CineForge itself."

**DOS-143.0** Design it so **CineForge never knows whether the speech was generated
by Qwen3-TTS, CosyVoice, GPT-SoVITS, or a future model**. The model becomes an
interchangeable implementation behind your own Voice Engine API.

## 143. (D1) The recommended architecture

**DOS-143.1**

```
                         CINEFORGE
                             │
                             ▼
                    ┌─────────────────┐
                    │ AI ORCHESTRATOR │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ VOICE ENGINE API│
                    │   /v1/voice/*   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  VOICE ROUTER   │
                    └────────┬────────┘
                             │
             ┌───────────────┼────────────────┐
             │               │                │
             ▼               ▼                ▼
       Qwen3-TTS         CosyVoice        GPT-SoVITS
       Adapter            Adapter           Adapter
             │               │                │
             └───────────────┼────────────────┘
                             ▼
                       GPU WORKER
                             │
                             ▼
                    AUDIO PROCESSOR
                             │
                             ▼
                    WAV / PCM / FLAC
                             │
                             ▼
                       CINEFORGE
```

**DOS-143.2** This is the key architectural decision: **the adapters change. The
API does not.**

## 144. (D2) Five major subsystems

**DOS-144.1**

```
voice-engine/
│
├── api/
│   ├── voices
│   ├── synthesis
│   ├── jobs
│   └── health
│
├── voices/
│   ├── enrollment
│   ├── profiles
│   ├── embeddings
│   └── consent
│
├── engines/
│   ├── qwen3/
│   ├── cosyvoice/
│   ├── gpt-sovits/
│   └── interface
│
├── audio/
│   ├── normalize
│   ├── denoise
│   ├── declick
│   ├── loudness
│   └── mastering
│
└── workers/
    ├── synthesis-worker
    └── audio-worker
```

## 145. (D3) The API is the permanent interface — register a voice

**DOS-145.1**

```
POST /v1/voices
```

Input:

```json
{
  "name": "My Voice",
  "language": "en",
  "reference_audio": "..."
}
```

Response:

```json
{
  "voice_id": "voice_8f31c",
  "status": "ready"
}
```

**DOS-145.2** The database knows that `voice_8f31c` belongs to the user's voice.

## 146. (D4) Generate speech

**DOS-146.1** CineForge doesn't call Qwen directly. It calls:

```
POST /v1/speech/generate
```

with:

```json
{
  "voice_id": "voice_8f31c",
  "text": "Welcome to BalanceVid.",
  "language": "en",
  "style": "authoritative",
  "speed": 1.0,
  "pitch": 0,
  "output": {
    "format": "wav",
    "sample_rate": 48000
  }
}
```

**DOS-146.2** **The Voice Engine decides which model should handle it.**

## 147. (D5) The model adapter — a common interface

**DOS-147.1**

```
VoiceEngine
│
├── registerVoice()
├── synthesize()
├── synthesizeBatch()
├── getCapabilities()
├── health()
└── unload()
```

Then:

```
Qwen3Adapter implements VoiceEngine

CosyVoiceAdapter implements VoiceEngine

GPTSoVITSAdapter implements VoiceEngine
```

**DOS-147.2** Qwen3 might internally call its `generate_voice_clone()`
functionality, while CineForge remains completely unaware of that implementation
detail. Qwen3's current code explicitly supports creating **reusable voice-clone
prompts** and generating speech from them. GitHub

**DOS-147.3** CosyVoice has a considerably different internal architecture — its
current implementation combines an **LLM speech-token stage, flow-matching/DiT
acoustic generation and a causal HiFT vocoder** — but that difference doesn't
matter to CineForge because it sits behind the adapter. GitHub

## 148. (D6) The really important part: Voice Profiles

**DOS-148.1** Don't store only the original WAV. Store a proper voice profile:

```
voice_profiles
────────────────────────
id
user_id
name
language
reference_audio_id
speaker_embedding
engine
engine_version
model_version
consent_status
created_at
updated_at
```

**DOS-148.2** For example:

```
voice_8f31c
     │
     ├── reference.wav
     ├── speaker_embedding
     ├── language: en
     ├── engine: qwen3
     ├── model: 1.7B-Base
     └── consent: confirmed
```

**DOS-148.3** Qwen3-TTS supports an **x-vector speaker representation** and also an
**ICL-style reference path**, which means the Voice Engine can decide whether to
retain a compact speaker representation or a richer reusable clone prompt
depending on the **quality/latency tradeoff**. GitHub

## 149. (D7) Don't generate an entire movie's narration in one request

**DOS-149.1** Instead:

```
Script
  │
  ▼
Script segmentation
  │
  ├── Scene 01
  ├── Scene 02
  ├── Scene 03
  ├── Scene 04
  └── Scene 05
        │
        ▼
     Voice jobs
        │
        ▼
      GPU queue
```

**DOS-149.2** Each chunk becomes:

```json
{
  "job_id": "voicejob_123",
  "voice_id": "voice_8f31c",
  "sequence": 4,
  "text": "...",
  "language": "en"
}
```

**DOS-149.3** That gives:

- retrying
- parallel generation
- progress reporting
- caching
- regeneration of one sentence
- timeline synchronization

without regenerating the entire film.

## 150. (D8) The existing audio pipeline takes over

**DOS-150.1** This connects directly with the audio work already done:

```
Voice Model
     │
     ▼
Generated WAV
     │
     ▼
Silence / pause analysis
     │
     ▼
De-click
     │
     ▼
Noise cleanup
     │
     ▼
Per-speaker loudness
     │
     ▼
EBU R128
     │
     ▼
Ducking
     │
     ▼
48kHz master
     │
     ▼
CineForge Mux
```

**DOS-150.2** **The AI model does not own mastering.** That remains the audio
engine's responsibility.

## 151. (D9) Model routing

**DOS-151.1** Initially:

```
                     Voice Request
                           │
                           ▼
                     Model Router
                           │
                    ┌──────┴──────┐
                    │             │
                 Qwen3        fallback
```

**DOS-151.2** Later:

```
                     Voice Request
                           │
                           ▼
                    Model Router
                           │
        ┌──────────────────┼─────────────────┐
        │                  │                 │
       Qwen3            CosyVoice        GPT-SoVITS
        │                  │                 │
   best quality        multilingual       fast
```

**DOS-151.3** Eventually the router could choose based on:

```
language
voice
quality
latency
GPU availability
cost
model capability
```

**DOS-151.4** For example:

```
English narration
→ Qwen3

Long multilingual project
→ CosyVoice

Low-VRAM worker
→ GPT-SoVITS
```

## 152. (D10) GPU infrastructure — separate workers

**DOS-152.1** Do not put the model directly into the main CineForge application
container. Use separate workers:

```
                    CineForge
                       │
                       ▼
                 Redis / Queue
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
    GPU Worker     GPU Worker     GPU Worker
      Qwen3         CosyVoice      GPT-SoVITS
```

**DOS-152.2** A worker can start, load the model, process jobs, and **remain warm**.

## 153. (D11) Cloud and self-hosted

**DOS-153.1** Cloud:

```
CineForge Cloud
       │
       ▼
Voice API
       │
       ▼
Your GPU cluster
```

**DOS-153.2** Self-hosted:

```
Customer's machine
       │
       ▼
CineForge Local
       │
       ▼
Local Voice Engine
       │
       ▼
Customer GPU
```

**DOS-153.3** Same API. Same CineForge application. Different deployment.

## 154. (D12) Voice caching

**DOS-154.1** If "Welcome to BalanceVid." is generated and later the exact same
sentence is requested, don't generate it again. Hash:

```
voice_id
+
model_version
+
text
+
language
+
style
+
speed
+
pitch
```

and create:

```
audio_cache/<hash>.wav
```

Then:

```
same request
     ↓
cache hit
     ↓
instant audio
```

**DOS-154.2** This can save enormous GPU time.

## 155. (D13) Batch generation

**DOS-155.1** For a movie with 100 narration segments, don't send 100 independent
HTTP requests from CineForge. Use:

```
POST /v1/speech/batch
```

```json
{
  "voice_id": "voice_8f31c",
  "language": "en",
  "segments": [
    {
      "id": "s01",
      "text": "Welcome..."
    },
    {
      "id": "s02",
      "text": "Today..."
    },
    {
      "id": "s03",
      "text": "Our story..."
    }
  ]
}
```

**DOS-155.2** The worker can optimize model loading and GPU utilization.

## 156. (D14) The architecture to freeze for CineForge

**DOS-156.1**

```
┌────────────────────────────────────────────────────┐
│                    CINEFORGE                       │
│                                                    │
│  Script → Orchestrator → Voice Engine API          │
└──────────────────────────┬─────────────────────────┘
                           │
                           ▼
                 ┌───────────────────┐
                 │   VOICE GATEWAY   │
                 └─────────┬─────────┘
                           │
                 ┌─────────▼─────────┐
                 │    JOB ROUTER     │
                 └─────────┬─────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
  Qwen3 Worker      CosyVoice Worker    GPT-SoVITS Worker
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  AUDIO ENGINE   │
                  │                 │
                  │ Normalize       │
                  │ De-click        │
                  │ Loudness        │
                  │ R128             │
                  │ Ducking          │
                  └────────┬────────┘
                           │
                           ▼
                    MEDIA ENGINE
                           │
                           ▼
                    FINAL VIDEO
```

**DOS-156.2 The crucial design decision.** Do not let CineForge depend on
Qwen3-TTS. Let CineForge depend on:

```
CineForge Voice API
```

and let the Voice API depend on:

```
VoiceEngine interface
```

Then **Qwen3 is simply Engine #1**, and it can be replaced later without rewriting
the CineForge application.

**DOS-156.3** This isn't theoretical: Qwen3-TTS already exposes the underlying
voice-cloning primitives needed for this design, while CosyVoice and GPT-SoVITS
have sufficiently different internals that an adapter boundary is particularly
valuable. GitHub

**DOS-156.4** **Freeze this architecture before Claude starts coding it.** The next
implementation step is to define the exact API contracts, database schema, Docker
services, Redis job schema, GPU worker interface, voice enrollment flow, and folder
structure so Claude can implement the Voice Engine **without coupling it to
CineForge**.

---

# E. "Go next" — CineForge Voice Engine implementation specification

**DOS-157.0** This is the next layer to give to Claude. The objective is to build
the Voice Engine as an **independent service, not as code embedded inside
CineForge**.

## 157. (E1) Repository structure

**DOS-157.1**

```
services/
└── voice-engine/
    │
    ├── apps/
    │   ├── api/
    │   │   ├── routes/
    │   │   │   ├── voices.ts
    │   │   │   ├── synthesis.ts
    │   │   │   ├── jobs.ts
    │   │   │   └── health.ts
    │   │   └── server.ts
    │   │
    │   └── worker/
    │       ├── worker.ts
    │       ├── processors/
    │       │   ├── enrollment.ts
    │       │   ├── synthesis.ts
    │       │   └── audio.ts
    │       └── gpu/
    │           └── model-manager.ts
    │
    ├── packages/
    │   ├── contracts/
    │   │   ├── voice.ts
    │   │   ├── synthesis.ts
    │   │   └── jobs.ts
    │   │
    │   ├── core/
    │   │   ├── voice-engine.ts
    │   │   ├── model-router.ts
    │   │   └── errors.ts
    │   │
    │   ├── adapters/
    │   │   ├── qwen3/
    │   │   ├── cosyvoice/
    │   │   └── gpt-sovits/
    │   │
    │   └── audio/
    │       ├── normalize.ts
    │       ├── loudness.ts
    │       ├── silence.ts
    │       ├── declick.ts
    │       └── mastering.ts
    │
    ├── migrations/
    ├── tests/
    ├── Dockerfile
    ├── docker-compose.yml
    └── README.md
```

**DOS-157.2** The most important boundary is `packages/core/voice-engine.ts`. That
becomes **the contract every model must implement**.

## 158. (E2) Model-independent interface

**DOS-158.1**

```ts
interface VoiceEngine {
  readonly id: string;
  readonly version: string;

  getCapabilities(): VoiceCapabilities;

  enrollVoice(
    request: VoiceEnrollmentRequest
  ): Promise<VoiceEnrollmentResult>;

  synthesize(
    request: SpeechSynthesisRequest
  ): Promise<SpeechSynthesisResult>;

  synthesizeBatch(
    request: BatchSynthesisRequest
  ): Promise<BatchSynthesisResult>;

  health(): Promise<EngineHealth>;

  unload(): Promise<void>;
}
```

**DOS-158.2** Qwen3 implements it. CosyVoice implements it. GPT-SoVITS implements
it. **CineForge never calls their proprietary/internal functions directly.**

## 159. (E3) Voice enrollment

**DOS-159.1** The user experience:

```
Create Voice
      ↓
Upload recording
      ↓
Voice quality analysis
      ↓
Consent confirmation
      ↓
Create voice profile
      ↓
Generate speaker representation
      ↓
Voice ready
```

**DOS-159.2** API:

```
POST /v1/voices
```

Example:

```json
{
  "name": "James Voice",
  "language": "en",
  "reference_audio_id": "asset_123",
  "consent": {
    "confirmed": true,
    "type": "self"
  }
}
```

Response:

```json
{
  "voice_id": "voice_01JXYZ",
  "status": "processing",
  "engine": "qwen3-tts"
}
```

**DOS-159.3** The API should **return immediately**. The GPU work happens
**asynchronously**.

## 160. (E4) Voice quality analysis

**DOS-160.1** Before creating the voice profile, analyze the recording. Check:

```
duration
sample rate
channels
silence percentage
clipping
SNR
background noise
speech percentage
peak level
```

**DOS-160.2** For example:

```json
{
  "duration_seconds": 42.7,
  "sample_rate": 48000,
  "channels": 1,
  "speech_ratio": 0.91,
  "clipping": false,
  "noise_score": 0.08,
  "quality": "good"
}
```

**DOS-160.3** If the recording is poor:

```
VOICE QUALITY: POOR

Background noise is high.
There is significant clipping.

Please upload a cleaner recording.
```

**DOS-160.4** This is important because **garbage reference audio produces poor
voice cloning**.

## 161. (E5) Voice profile — and engine-specific artifacts

**DOS-161.1** Database `voice_profiles`, recommended fields:

```
id
user_id
name
language
status
reference_audio_id
speaker_embedding
clone_prompt
engine_id
engine_version
model_id
model_version
consent_type
consent_confirmed
created_at
updated_at
```

**DOS-161.2** But **don't assume every model has the same representation**.
Therefore `voice_engine_artifacts` holds engine-specific data:

```
voice_engine_artifacts
────────────────────────
id
voice_id
engine_id
engine_version
artifact_type
artifact_uri
metadata
created_at
```

**DOS-161.3** For Qwen: `artifact_type = qwen_voice_clone_prompt`. For another
engine: `artifact_type = speaker_embedding`. This is a **very important
abstraction**.

## 162. (E6) Synthesis API

**DOS-162.1** CineForge calls:

```
POST /v1/speech
```

Request:

```json
{
  "voice_id": "voice_01JXYZ",
  "text": "Welcome to BalanceVid.",
  "language": "en",
  "style": {
    "emotion": "authoritative",
    "energy": 0.65,
    "speed": 1.0,
    "pitch": 0
  },
  "output": {
    "format": "wav",
    "sample_rate": 48000,
    "channels": 1
  }
}
```

Response:

```json
{
  "job_id": "voicejob_01JABC",
  "status": "queued"
}
```

**DOS-162.2** **Don't make the HTTP request wait for GPU inference.**

## 163. (E7) Job architecture

**DOS-163.1** Use the existing queue philosophy:

```
CineForge
   │
   ▼
Voice API
   │
   ▼
PostgreSQL
   │
   ▼
Redis / BullMQ
   │
   ▼
GPU Worker
```

**DOS-163.2** Job:

```json
{
  "id": "voicejob_01JABC",
  "type": "speech.synthesis",
  "voice_id": "voice_01JXYZ",
  "engine": "qwen3-tts",
  "priority": "normal",
  "payload": {
    "text": "Welcome to BalanceVid.",
    "language": "en"
  }
}
```

## 164. (E8) Job states

**DOS-164.1**

```
queued
↓
claimed
↓
loading_model
↓
generating
↓
post_processing
↓
completed
```

Failure: `failed`. Cancellation: `cancelled`.

**DOS-164.2** This gives CineForge **reliable progress tracking**.

## 165. (E9) Long scripts

**DOS-165.1** Don't send a 30-minute script directly into the model. Pipeline:

```
30-minute script
       ↓
Text segmentation
       ↓
Paragraphs
       ↓
Sentences
       ↓
Speech segments
       ↓
GPU jobs
       ↓
Individual WAV files
       ↓
Timeline assembly
```

**DOS-165.2** Each segment gets:

```
segment_id
sequence
text
start_time
duration
audio_asset
```

Example:

```json
{
  "segment_id": "seg_004",
  "sequence": 4,
  "text": "This is the future of independent television.",
  "audio_asset_id": "audio_928",
  "duration_ms": 3820
}
```

## 166. (E10) Audio mastering belongs outside the model

**DOS-166.1** This is critical. **Do not ask the TTS model to be your mastering
system.** Architecture:

```
TTS
 │
 ▼
Raw generated speech
 │
 ▼
Trim / silence
 │
 ▼
De-click
 │
 ▼
Noise processing
 │
 ▼
Loudness normalization
 │
 ▼
EBU R128
 │
 ▼
Final narration WAV
```

**DOS-166.2** That integrates with the audio requirements already established for
CineForge.

## 167. (E11) Model router

**DOS-167.1** The router receives:

```json
{
  "language": "en",
  "quality": "cinematic",
  "latency": "normal",
  "voice_id": "voice_123"
}
```

and selects Qwen3-TTS, or CosyVoice, or GPT-SoVITS.

**DOS-167.2** **The decision should not be hardcoded into CineForge.** Use
configuration:

```yaml
models:
  qwen3:
    enabled: true
    priority: 100

  cosyvoice:
    enabled: false
    priority: 80

  gpt_sovits:
    enabled: false
    priority: 60
```

**DOS-167.3** Routing can then change later **without rebuilding CineForge**.

## 168. (E12) Model capabilities

**DOS-168.1** Every adapter reports what it supports. For example:

```json
{
  "engine": "qwen3-tts",
  "capabilities": {
    "voice_cloning": true,
    "voice_design": true,
    "multilingual": true,
    "emotion_control": true,
    "streaming": false,
    "batch": true
  }
}
```

**DOS-168.2** Then **the router knows what it can safely request**.

## 169. (E13) Storage

**DOS-169.1** **Don't put generated audio inside PostgreSQL.** Use object storage:

```
voices/
    voice_01JXYZ/
        reference/
            original.wav
            normalized.wav

        artifacts/
            qwen/
                clone_prompt.bin

audio/
    voicejob_01JABC/
        raw.wav
        processed.wav
        final.wav
```

**DOS-169.2** PostgreSQL stores metadata. Object storage stores media.

## 170. (E14) Security

**DOS-170.1** Voice profiles are **sensitive**. At minimum:

```
Authentication
        ↓
User owns voice
        ↓
Permission check
        ↓
Voice generation
```

**DOS-170.2** **Never allow `POST /v1/speech` with someone else's `voice_id`.**
Database policy `user_id → voice_id` must **always be enforced server-side**.

**DOS-170.3** For voice enrollment, `consent_confirmed = true` should be
**required**.

## 171. (E15) Docker architecture — separate CPU and GPU services

**DOS-171.1**

```
voice-api
voice-worker
voice-postprocessor
redis
postgres
object-storage
```

GPU:

```
voice-gpu-qwen
```

Later:

```
voice-gpu-cosyvoice
voice-gpu-gptsovits
```

**DOS-171.2** So you **don't have to install every model on every GPU machine**.

## 172. (E16) Deployment

**DOS-172.1**

```
                   INTERNET
                       │
                       ▼
                CineForge API
                       │
                       ▼
                Voice Gateway
                       │
                 Redis Queue
                       │
       ┌───────────────┼────────────────┐
       │               │                │
       ▼               ▼                ▼
 Hetzner GPU       RunPod GPU       Future GPU
 Qwen Worker      CosyVoice        GPT-SoVITS
       │               │                │
       └───────────────┼────────────────┘
                       ▼
                 Object Storage
                       │
                       ▼
                    CineForge
```

**DOS-172.2** If Render is later stopped, **the Voice Engine doesn't care**.

## 173. (E17) The most important API boundary — freeze now

**DOS-173.1** CineForge should **only** know this:

```
POST /v1/voices
POST /v1/speech
POST /v1/speech/batch
GET  /v1/voices/:id
GET  /v1/jobs/:id
DELETE /v1/voices/:id
```

**DOS-173.2** Everything underneath is the implementation. **That is the part to
freeze now.**

## 174. (E18) What Claude should NOT do

**DOS-174.1** Tell Claude explicitly:

- **DOS-174.2** Do not embed Qwen3-TTS directly into CineForge.
- **DOS-174.3** Do not make CineForge import Qwen3 libraries.
- **DOS-174.4** Do not make the frontend know which TTS model is being used.
- **DOS-174.5** Do not store model-specific assumptions in CineForge's database schema.
- **DOS-174.6** Do not make synthesis requests synchronous.
- **DOS-174.7** Do not couple audio mastering to the TTS model.
- **DOS-174.8** Do not make voice profiles dependent on one specific model's internal representation.

**DOS-174.9** Instead: **Build a model-independent Voice Engine service with an
adapter interface.**

## 175. (E19) The development sequence

**DOS-175.1** Have Claude build it in this order:

```
PHASE 1
Voice Engine contracts
        ↓
PHASE 2
API + authentication
        ↓
PHASE 3
Database + voice profiles
        ↓
PHASE 4
Object storage
        ↓
PHASE 5
Redis/BullMQ jobs
        ↓
PHASE 6
Qwen3-TTS adapter
        ↓
PHASE 7
GPU worker
        ↓
PHASE 8
Audio post-processing
        ↓
PHASE 9
CineForge integration
        ↓
PHASE 10
CosyVoice adapter
        ↓
PHASE 11
GPT-SoVITS adapter
        ↓
PHASE 12
Model router / benchmarking
```

## 176. The end result

**DOS-176.1** A CineForge user will eventually see something as simple as:

```
VOICE
────────────────────────────

Voice:     My Voice ▼

Language:  English ▼

Style:     Cinematic ▼

Emotion:   Authoritative ▼

Speed:     ━━━━━●━━ 1.0

[ Generate Voice ]

────────────────────────────
```

**DOS-176.2** Underneath that simple UI is the complete infrastructure:

```
CineForge
    ↓
Voice API
    ↓
Model Router
    ↓
Qwen3 / CosyVoice / GPT-SoVITS
    ↓
GPU
    ↓
Audio Processing
    ↓
Media Engine
    ↓
Final Film
```

**DOS-176.3** That is the architecture to use rather than making CineForge itself a
voice-cloning application. It gives a **standalone AI capability** that can later
be exposed to BalanceVid Studio 1, Studio 2, Online TV, dubbing, digital presenters
and multilingual production.

---

*End of Part 4. The author is sending further parts until they say "complete".*
