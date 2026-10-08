# 45 — Intelligence layer and Film IR (DirectorOS W2)

**Status:** implemented in code (2026-10-08). Migration 0032 (`ai_decisions`)
is **not applied** to the live database; until it is, AI decisions go to the
worker log only. Contracts: [film-ir.md](directoros/contracts/film-ir.md),
[intelligence-layer.md](directoros/contracts/intelligence-layer.md).

## 1. What changed

| Before | Now |
|---|---|
| One Claude tool call returned a thin draft: one protagonist, one location, scene beats | One **master call** returns the complete Film Production Package: bible, whole cast with canonical identity and wardrobe, locations, props, acts, story threads, setups/payoffs, scenes with purpose, emotional arc, per-character state, structured dialogue, narration, audio plan, and every shot with length and camera |
| Invalid output padded with invented defaults | A five-stage **validator** (schema, references, story, production, budget); on failure **one surgical revision** call naming exactly the issues; still invalid → the film fails with the issues (no credits used) |
| Shots by formula: 18 s scenes × 4 shots × 5 s, size cycled `i % 4` | Shots as the Director planned them (2–5 s each, up to 4 per scene, scene and film length within ±15% of what was paid for), with `camera_plan` (size, angle, movement, lens, transition, subjects) |
| Shot prompt = protagonist appearance + location + summary | Prompt assembled by the **Production Compiler** from canon: framing, action, every subject's canonical identity and the scene's wardrobe/physical state, location, light, visual style |
| Claude SDK called directly in the Director, translation and social kit | Every reasoning call goes through the **provider-neutral router**; no vendor SDK in the worker |
| Default model `claude-opus-4-8` with forced tool use | Default `claude-opus-5-5` with structured outputs (forced tool use is rejected by Opus 5.5) |
| No record of AI calls | **Decision log**: one `ai_decisions` row + `ai.decision` log line per attempt (prompt id/version, provider, model, hashes, outcome, tokens, latency) |
| Social kit fell back to a template on failure | The launch fails with the reason |

Narration is the narrator's first source again (dialogue lines now exist but
are read by one voice until the Voice Engine, W7).

## 2. Configuration

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Claude provider (the default route) |
| `ANTHROPIC_MODEL` | default model for every task (unset → `claude-opus-5-5`) |
| `INTELLIGENCE_ROUTES` | per-task ordered routes, e.g. `film_plan=anthropic:claude-opus-5-5\|openai:gpt-5;translation=anthropic:claude-sonnet-5-5`. Tasks: `film_plan`, `film_plan_revision`, `translation`, `social_kit`. A later route is used only when listed — never silently. |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | OpenAI provider, when a route names it |

**Cost note:** the master call returns a large package, streamed, with output
capped at 12k + 2.5k tokens per scene. Claude Opus 5.5 is $4 / $20 per million
input / output tokens, so a 3-minute film (10 scenes) costs at most about
$0.75 of output per plan, and up to twice that when a revision is needed. Route `film_plan` to a cheaper model
with `INTELLIGENCE_ROUTES` if that matters more than plan quality.

## 3. Apply migration 0032 (owner step)

After 0027–0031:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f packages/db/supabase/migrations/0032_ai_decisions.sql
```

Check: `select task, provider, model, outcome, error_code from ai_decisions order by created_at desc limit 20;`

## 4. Verify after deploying the worker

1. Create a 30 s film. Worker log: `director.planned` with `provider`,
   `model`, `revised`; an `ai.decision` line per call.
2. The project has several characters and locations when the brief calls for
   them; `dialogue_lines` has rows; shots have a `camera_plan` and lengths of
   2–5 s.
3. `screenplays.raw.package` holds the full Film IR.
4. With `ANTHROPIC_API_KEY` removed the film fails with "the AI Director is
   unavailable" (never a stand-in).
