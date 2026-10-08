# 44 — Truth layer (DirectorOS W1)

**Status:** implemented in code (2026-10-08). Migration 0031 is **applied to
the live database** (2026-10-08); degradations and capabilities are written
once the worker running this code is deployed. Contract:
[directoros/contracts/truth-layer.md](directoros/contracts/truth-layer.md).

The rule: a production either delivers what it says, fails with a reason, or
delivers something weaker **and says exactly what**. Nothing in between.

## 1. What changed in behaviour (read before deploying)

| Situation | Before | Now |
|---|---|---|
| `ANTHROPIC_API_KEY` missing or Claude fails | a stub film "Adisa / The Kingdom" was produced and billed | project `FAILED`: "the AI Director is unavailable" (no credits used) |
| Director returns an incomplete plan | gaps padded with invented text | project `FAILED`: "incomplete plan" |
| GPU pod without CUDA | grey placeholder clips returned as success | `/generate` 503 `CUDA_UNAVAILABLE`; shot fails; film fails with the reason |
| GPU returns a placeholder clip | delivered | shot fails (`PLACEHOLDER_OUTPUT`) |
| GPU clamps size or length (e.g. `WAN_MAX_FRAMES=25` → 1.56 s of 5 s) | invisible | recorded per shot (`OUTPUT_CLAMPED`, major) and shown |
| Reference frame / camera ignored, LoRA not applied | invisible | recorded (`REFERENCE_IGNORED`, `LORA_SKIPPED`) |
| Provider says the clip is stored | shot `READY` | storage is checked first (`ARTIFACT_MISSING` retried, then fails) |
| A shot fails for good (auto mode) | project stuck on GENERATING, resumed in a loop | project `FAILED` with the shot's reason |
| Some shots missing at render | film assembled with gaps | film `FAILED` (`SHOTS_MISSING`, names the shots) |
| Audio mix fails | film shipped silent | render fails (`AUDIO_MIX_FAILED`, retried once) |
| No storage configured | `READY` film row pointing at nothing | render fails (`STORAGE_UNCONFIGURED`) |
| Narration or music provider missing / failing | track silently skipped | recorded `TRACK_MISSING` per scene/film |
| Narration longer than 4000 characters | cut at 4000 | spoken in full (split by sentence) |
| Translation fails | English stored as fr/de subtitles and dub | that language skipped and recorded (`TRANSLATION_FAILED`) |
| 4K chosen but no upscaler / not on plan / upscale fails | silently 1080p | recorded (`UPSCALE_UNAVAILABLE` / `UPSCALE_FAILED`) |
| Moderation cannot run | treated as passed | recorded `MODERATION_SKIPPED`; fails instead with `MODERATION_REQUIRED=1` |
| 9:16 / 1:1 / 4:5 placement, 480p/1080p format | shown, then made at 1280×720 | persisted and generated at that shape and size; portrait no longer squashed to square by the GPU caps |
| System page | hand-written "Implemented" badges | Reality Gate maturity + live capability registry |

## 2. Switches (all default off)

| Variable | Where | Effect |
|---|---|---|
| `DIRECTOR_ALLOW_STUB=1` | worker | local runs/tests only: stub plan when no LLM |
| `ALLOW_PLACEHOLDER_MEDIA=1` | worker | local runs/tests only: accept placeholder clips; metadata-only render without storage |
| `CINEFORGE_PLACEHOLDER=1` | GPU worker | run the FFmpeg placeholder (reported as `realExecution: false`) |
| `MODERATION_REQUIRED=1` | worker | fail a production when the content check cannot run |
| `CAPABILITY_PUBLISH_SEC` | worker | registry publish interval (default 300, min 60) |

CI rejects any other substitute switch (`scripts/check-truth.mjs`).

## 3. Apply migration 0031 (owner step)

Apply after 0027–0030 (docs/41 runbook), in the same way:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/supabase/migrations/0031_truth_layer.sql
```

Check:

```sql
select count(*) from public.system_capabilities;        -- > 0 within 5 min of a worker start
select code, severity, message from public.production_degradations order by created_at desc limit 20;
```

0031 only adds two tables; it changes no existing table and nothing in the
running system depends on it (the worker tolerates its absence).

## 4. Verify after deploying the worker

1. Worker log shows `{"event":"truth.capabilities",...}` once at start.
2. Admin → *What works right now* lists the capabilities with real statuses.
3. Create page: formats the GPU cannot produce are not offered (with the
   default `WAN_MAX_*` caps only 480p is real).
4. Start a short film; its production page lists what it ran without (for
   example `OUTPUT_CLAMPED` while `WAN_MAX_FRAMES=25`).
