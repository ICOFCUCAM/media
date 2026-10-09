# 57 — Animation Studio (DirectorOS W12)

**Status:** implemented in code (2026-10-09); migrations 0046–0047 **applied
live**. Contract: [animation.md](directoros/contracts/animation.md).
Requirements: Part 5 ([part-05-cartoon-animation-layer.md](directoros/part-05-cartoon-animation-layer.md), DOS-177–186).

The Animation Studio is not a separate product (§186.2). It is an
orchestration layer: it tells the engines that already exist — the Director,
the prompt compilers, image, video, voice, music, render — how to work
together for cartoons, shorts, stories, motion comics and shows.

## 1. Where it lives

`/create/animation` (also in the Studio nav and the Create menu), with one tab
per thing you make (§185):

| Tab | Makes | Notes |
|---|---|---|
| Cartoon | an animated film (`kind film`, `medium animation`) | any style but motion comic |
| Short film | `short_film`, 30 s – 20 min | |
| Story | `story`, narrated in every scene | a sentence is enough; storybook by default |
| Motion comic | `motion_comic` | the motion-comic style only |
| Episode | `episode` of a show | reads the Show Bible and every earlier episode |
| Character | a Character Card | reusable everywhere |

Every animated entry on the Create menu (Cartoon, Short Film, Story, Motion
Comic, Episode, Character) opens this workspace.

## 2. Character Cards (§179, §183)

A card is a character in the owner's Library: name, look, age, height, hair,
eyes, usual clothing, personality, animation style, a Voice Studio voice
and/or a voice description, and an **animated design** — proportions, exact
colours, how they move (migration 0046; the database checks height, style and
that a design has all three parts).

**Use character** casts cards into a production (`project_cast`). The project
is created DRAFT, its cards attached, then moved to PLANNING — the worker
claims PLANNING projects, so it never plans without its cast. Then:

1. The plan request carries a **CAST** section with each card's id
   (`char_<name>`), name and identity.
2. The validator requires every card in the package, unrenamed, in at least
   one scene (`CAST_MISSING`, `CAST_RENAMED`, `CAST_UNUSED`).
3. After planning, CineForge **writes the card's identity over what the
   model wrote** (`applyCast`): face, hair, body, design, voice, personality.
   Continuity is solved at the orchestration level (§179.5), not hoped for.
4. The production's character row points back at the card
   (`characters.source_character_id`), carries its height/hair/eyes/clothing,
   and speaks in the card's voice.

## 3. Animated design (§179.4)

The Film IR character gains `design` — proportions, palette, movement — null
for live action, **required for animation** (`DESIGN_MISSING`). The
continuity context and every prompt carry it: image and video prompts get
the proportions and colours; video prompts also get how the character moves.
Live-action prompts and their hashes are unchanged (the field is added only
when present).

Prompt versions: `director.master` **v6**, `director.revision` **v5** (the
rules and the package schema changed). Both are unscored until `bench:live`
runs.

## 4. Shows: the Show Bible and episodes (§184)

A show made episode by episode is a series project with `mode 'show'`: it
holds the series row, the **Show Bible** (`show_bibles`: genre, audience,
world rules, locations, music identity, narrative rules, episode format,
continuity rules) and the show's cast; it is never queued itself (migration
0047). Its title, visual style and cast complete the bible (character bible,
voice cast).

An **episode production** (`kind episode`, `series_id`, `episode_number`)
plans with:

- **SHOW BIBLE** — the rules, hard.
- **EPISODE n / PREVIOUSLY** — for every earlier episode (a one-pass season's
  acts count as its first episodes; the newest production of a number wins):
  its synopsis, what the audience knows by its end, who died, how characters
  stand. *Episode 7 knows what happened in Episode 1* (§184.3).
- **RETURNING CHARACTERS** — everyone earlier episodes introduced, with their
  identities; whoever appears keeps them (restored after planning). The dead
  may appear only in flashbacks (`DECEASED_APPEARS`).
- **CAST** — the show's cards and the episode's own, required.

The plan is kept as that number in Season 1 (`episodes.project_id` names the
production that made it).

A season planned in one pass (W11) now has **1–5 episodes**: the Film IR has
at most 5 acts, so the old 1–52 limit let a 6-episode season through to a
plan that could never validate. Longer shows are made episode by episode; the
Series studio says so at its limit.

## 5. Storybook and motion comic: the still-motion engine (§181.4–6)

A storybook page or comic panel **is** the shot's drawn still. The
still-motion engine (`apps/worker/src/animation/still-motion.ts`) moves the
camera across it in FFmpeg — a slow push, a pan across the panel, a tilt down
the page, crane, drone pull-out, handheld sway — at 24 fps. No video model and
no GPU run, so a drawn shot costs one image (metered as an image) plus a
fraction of a second of CPU; estimates show this (`STILL_MOTION_SHOT_MS`).

It is a video adapter like any other: it reports what it actually produced
(execution report; a timing report measured with ffprobe) and the clip passes
the same quality gates before the shot is READY. Tested against real FFmpeg:
every camera move gives the exact frame count, the timing gate accepts it,
and the freeze detector does not mistake a slow move for a frozen clip.

Every shot of a storybook or motion-comic production starts as an image, even
when seed frames are off; a drawn shot whose page cannot be drawn fails with
the reason (no text-to-video stand-in).

## 6. What is still open

- The card has no generated character image yet (§183.1).
- Characters do not animate within a storybook page or comic panel — the
  camera moves; the drawing does not (§181.4–5).
- No sound-effect generator, for any production (§178.4, §180, §181.5).
- Every episode lands in Season 1; further seasons are not modelled (§178.2).
- Self-hosted animation models wait on docs/39 Phase 1 like every model.

## 7. Owner steps

- Run `bench:live` to score `director.master` v6 and `director.revision` v5.
- Deploy the worker (the still-motion engine needs `ffmpeg`/`ffprobe`, which
  the worker image already has) and the web app.
