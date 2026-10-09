# 64 — Previs you can judge, review-first by default, and a locked film rendered from its timeline (DirectorOS W19)

**Status:** implemented in code (2026-10-09). No migration.
Contract: [previs-and-lock.md](directoros/contracts/previs-and-lock.md).
Requirements: Part 1 §38 and §40–43.
It builds on W8 (passes and locks, docs/52–53), W12 (the still-motion engine)
and W18 (the timeline in the render path, docs/63). It also includes an audit
of early statuses (§5).

## 1. Previs: stills, rough voice, animatic, timing (§42–43)

Previs used to draw storyboard stills only. Once the story is approved, each
scene now runs its own previs flow:

1. **Storyboard stills:** one per image-led shot, as before.
2. **The rough voice:** the scene's narration and dialogue, spoken on the
   Voice Engine. This is the scene's real voice track. The audio job skips a
   scene that already has one, and the speech cache keeps every line, so the
   final pass reuses it and nothing is spoken or paid for twice.
3. **The animatic:** each still is moved by its shot's planned camera
   (push-in, pan, tilt, crane, handheld, drone; the still-motion engine of
   W12) for its planned length. The shots are joined, and the voice is laid
   under them. A text-led shot with no still shows as a dark card. The
   animatic is 640 px on its long side, H.264 with AAC audio, and is recorded
   as the scene's video version (`derivation.role = "animatic"`) with its
   timing.
4. **Rough timing:** if the voice runs more than half a second past the
   planned pictures, the scene is flagged `PREVIS_TIMING` and the owner is
   told before approving.

A step that fails does not hold the others back. The animatic shows what
there is, and an animatic that cannot be built never blocks approval: the
stills are still there. No video model runs and no GPU second is spent.

In the passes panel, each scene shows its stills, its animatic (with the
picture and voice lengths) and, when the voice runs over, a warning. The owner
approves the scene from that.

## 2. Review-first is the default (§41, §43.4)

In the create flow, **Review story & storyboard first** is now the default
and comes first. **Straight through** is still a choice. API callers keep
single-pass unless they ask for three. With the default, no GPU video is made
until the owner has approved the story and each scene.

## 3. A locked film renders from its approved timeline (§38, §40.3)

Locking a finished film (W8a) used to freeze it without producing anything.
Now, when the owner locks it:

1. The poller claims the film. Only a READY, locked film whose lock has no
   approved timeline yet is claimed; it moves to RENDERING so that no two
   workers take it.
2. The production timeline is built from the locked scenes. A shot the editor
   cut (W13) occupies its cut length. The timeline is saved and **approved**,
   and the database then freezes its events. Approved timelines from earlier
   locks are superseded.
3. The master is rendered **from the timeline**: the timeline decides the
   order of the scenes and shots, and exactly how long each shot plays. A shot
   the timeline names without a clip refuses to render.
4. On delivery the timeline is **frozen**. The master version records which
   timeline it is. The sync check (W18) runs on that timeline rather than on a
   new draft.

Unlocking and locking again gives a new approved timeline and a new master.
`LOCK_RENDER=0` switches this off.

## 4. What is still open

- **Audio stems** are placed per scene. The timeline's audio events do not
  place them yet (§40.3). Ducking and fades come from the production profile.
- **Lip sync and frame interpolation** in the media engine (§2.4).
- **Weather and sun position** as tracked state (§33.2), and a location's
  per-time state (§6.1).
- **API callers** still default to single-pass.

## 5. Status audit

The early requirements were marked against the code as it stood in W2. Many
of them were completed by later workstreams but never re-marked. W19
re-checked them against the code. Thirty are now marked built, among them:

- the stance and the four layers (§0, §2.1–2.3, §2.5);
- the character bible (§4);
- props, story and scene graphs (§7–9);
- the compilable movie (§22, §59);
- prompt compiler protection (§68);
- the revised architecture and batch reasoning (§96, §98).

Rows that are still short stay shallow, with corrected notes, for example
§2.4 (lip sync) and §6.1 (weather).

Totals after W19: 335 built, 57 shallow, 21 not built (81 % of the
requirements). The 21 not built are GPU/ComfyUI work gated on Phase 1.

## 6. Owner steps

- Deploy the worker and the web app.
- Optional: `LOCK_RENDER=0` keeps locking from re-rendering.
