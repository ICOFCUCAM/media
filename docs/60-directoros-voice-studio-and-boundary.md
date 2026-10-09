# 60 — Voice Studio on the Voice Engine: readings, licences, traits, ledger (DirectorOS W15)

**Status:** implemented in code (2026-10-09). Migrations 0050 and 0051 are
**applied live**.
Contract: [voice-studio.md](directoros/contracts/voice-studio.md).
Requirements: Part 1 §19.2; Part 3 §116–117, §128; Part 4 §143, §149, §156,
§170, §174.

None of this needs a GPU. Self-hosted voice models stay gated until Phase 1.

## 1. Every speech path goes through the Voice Engine (§128, §143, §156, §174)

The Voice Studio reader used to send text straight to a fal model. It now
uses `apps/worker/src/voice/reading.ts`, the same way film voices, dubs and
`/v1` jobs do:

- routed through the Phase 1 gate, the licence registry (W14) and the
  configuration;
- spoken through the cached, metered engine, so a cache hit is never billed;
- mastered outside the model, then joined and encoded.

No product code calls a speech provider. The old direct clone path is gone,
because voices enroll through `voice.enroll` jobs. The talking avatar is a
video (lip-sync) provider: it animates a finished reading, and the UI names no
model.

## 2. Readings: modes and delivery (§116–117)

| Mode | What it does |
|---|---|
| Narrator | calm, even delivery for books, documentaries and explainers |
| Presenter | brighter and slightly faster, for news, adverts and announcements. A finished reading can become a talking-avatar video. |
| Conversation | a script written as "Name: line", each speaker in their own voice (two to four speakers) |

**Delivery controls:** emotion, energy, speed and pitch. Controls the owner
leaves untouched follow the mode's defaults. An engine that cannot apply a
control ignores it.

**Errors:**
- These readings fail before anything is spoken:
  - an empty reading;
  - an over-long one (`VOICEOVER_MAX_CHARS`, default 20,000);
  - a conversation with an unassigned speaker.
- A provider failure is retried first; the reading fails after the last attempt.

## 3. Community voices need a per-use licence (§170)

A shared voice becomes usable only after the user accepts its owner's terms
with `accept_voice_terms`:

- the terms are copied into `voice_licences` as they stand at that moment;
- only an APPROVED, READY voice with recorded consent can be licensed;
- your own voice needs no licence.

The licence holder can revoke it, and the voice's owner can see who holds one.

**Enforced twice:**
- **In the database:** a trigger on `voiceovers` refuses any reading, or any
  conversation speaker, that names a voice the user neither owns nor holds an
  active licence to, for a voice still on the shelf. This is §170.2's
  "always enforced server-side".
- **In the worker:** the check runs again at speaking time, because a licence
  can be revoked, or a voice withdrawn, after the reading was queued.

A voice without consent never speaks. A chosen voice never falls back to a
built-in one: the reading fails and says why.

Migration 0051 removes the RPC access that Supabase grants by default:
- `anon` cannot call the licence functions;
- nobody can call `voice_usable_by` or the trigger function.

## 4. A character's voice traits (§19.2)

`characters.voice_profile.traits` holds a character's pitch (−6 to +6
semitones), pace (0.8× to 1.25×) and loudness (−6 to +3 dB). They apply in
every scene and every dub:

- pitch and pace go to the engine with each line, and the line keeps its own
  emotion;
- loudness is applied as a gain after mastering, with a limiter at the
  mastering ceiling so the voice never clips.

They are edited under "Voice traits" on each character card.

## 5. The speech ledger (§149)

Each spoken narration or line of a film is one `audio_generations` row:
- its span on the Master Clock: the scene's planned start plus the cue's start;
- the voice (a CineForge voice id, or `builtin:<preset>`, never a provider's id);
- the engine and its version;
- how many segments it took;
- the outcome `ACCEPTED / SPOKEN`.

A ledger write failure never blocks the track.

## 6. Also fixed

CI's migration-test loop stopped at `004x`, so the 0049 test from W14 never
ran in CI. It now runs `005x` too.

## 7. What is still open

- **Live conversation (§117.4):** LLM, then a cloned voice, then an avatar.
  Not built; today's conversations are scripted.
- **Dubbing (§117.3):** no lip synchronisation.
- **Avatars:** remain a hosted video provider.
- **Self-hosted voice models and the GPU voice worker:** wait on Phase 1.

## 8. Owner steps

- Deploy the worker and the web app.
