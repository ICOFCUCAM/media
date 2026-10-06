# 35 · Studio design system

The Cineforge studio is one application: the existing engines (FilmStudio,
StoryboardStudio, SeriesStudio, useCreateRun, RunPanel, SupabaseRun, the
libraries, publishing, billing, analytics, enterprise) dressed in one visual
system derived from the homepage and the page designs in `docs/design/`.

## Rooms

Colours are Tailwind `cf-*` tokens backed by CSS channel variables
(`app/globals.css`), so a component renders correctly in either room:

| Token | Paper (`.cf-light`) | Dark (`.cf-dark`) |
|---|---|---|
| `cf-bg` / `cf-panel` / `cf-soft` | paper, white card, soft fill | near-black, panel, soft |
| `cf-fg` / `cf-muted` / `cf-dim` | ink and greys | cream and greys |
| `cf-line` / `cf-line2` | hairlines | hairlines |
| `cf-accent` | acid green (primary action, live) | acid green |
| `cf-inverse` / `cf-on-inverse` | ink block / paper text | cream block / black text |
| `cf-ok` / `cf-warn` / `cf-danger` | status | status |

The shell picks the room per route (`components/cf/nav.ts → roomFor`):
production rooms (characters, worlds, assets, production file) are dark,
everything else is paper. A dark block inside a paper page (the Director's
Board, the screening stage, the preview window) is just a nested `.cf-dark`.

Type: Manrope (display / wordmark), Georgia serif (editorial headlines with
italic emphasis), Inter (body), DM Mono (labels, data). Fonts are
self-hosted by `next/font` in `app/layout.tsx`.

## Shell

`components/cf/Shell.tsx`, mounted by `app/(app)/layout.tsx`:

- **Rail** — the production families from `NAV` (lib/products), always the
  institution's black; the admin family only in the Super view.
- **Navigator** — the active family's pages (desktop), credits balance and
  the Viewing-as switch (RoleContext).
- **Topbar** — breadcrumb, account (Supabase auth; sign-in opens AuthCard),
  and the mobile index.

`NAV` stays the single source of truth for what exists. Add a page by adding
it to `NAV`; the rail, navigator, breadcrumb and mobile index follow.

## Primitives

`components/cf/primitives.tsx` (hook-free): `PageHeader`, `Section`,
`Split` / `Cell`, `SpecList`, `Control`, `Status`, `ActionBand`,
`EmptyState`. Client helpers: `StudioGate` (Supabase / loading /
sign-in gate). Studio rooms use `StudioLayout` (see "Studios are tools" below).
Component classes: `cf-btn-accent`, `cf-btn-ink`, `cf-btn-line`,
`cf-option` (`aria-pressed` = selected), `cf-input`, `cf-label`,
`cf-eyebrow`, `cf-display`, `cf-link`.

## Rules

1. **The engine is the source of truth.** A redesign changes JSX and
   classes; it does not replace handlers, queries, Realtime subscriptions or
   the run lifecycle.
2. **No simulated state.** Progress, stages, counts and statuses come from
   real rows or the run. Preview runs are labelled as previews.
3. **No pretend features.** If the design shows something with no backend
   (paid marketplace, channel access control, a music engine), the UI says
   it is not open yet rather than offering a dead control.
4. **Square, ruled, quiet.** Hairlines and ruled grids instead of rounded
   cards and gradients; the accent marks the primary action and live state.
5. **Accessible by default.** Labelled fields, `aria-pressed` on options,
   `role="alert"` for errors, visible focus, reduced-motion respected.

## Verifying the studio

Before shipping a change to the studio:

1. `pnpm --filter @cineforge/web exec tsc --noEmit`, `npx eslint apps/web`,
   `pnpm --filter @cineforge/web build`, `pnpm test` (package suites).
2. Load every route in `NAV` plus `/`, `/projects/<id>`, `/studio`,
   `/system` at 1440, 1100 and 390 px: no console errors, no horizontal
   page overflow, breadcrumb and navigator present.
3. Walk the flows: the gate resolves (type, material) to the right room;
   switching modes rewrites `?mode=`; Script → board → Generate all →
   Assemble; a series, trailer, short and advert each start a run and show
   the console; a platform switch clamps the short's length; the mobile
   index opens, closes on Escape and route change, and returns focus.
4. With Supabase configured, sign in and repeat the runs live: the banner
   reads *Live production*, the production file link appears, and the
   project shows up in the archive with Realtime status.

## Gaps found while wiring the studio — and what happened to them

Corrections first: the plan length cap, AI seed frames and the brand-kit
outro were already handled by the worker (`film.processor` clamps auto
films to the plan ceiling; `resolveSeedKey` paints seed frames with
GPT-image-1; `render.processor` stamps the kit's logo and colour for
Agency+). An earlier version of this section said otherwise.

Fixed:

- **Scene-by-scene generation reached no worker.** The Director's Board
  flipped scenes to READY with a browser timer and "assembled" a film row
  for an MP4 that was never rendered. Board shots are now queued
  (`QUEUED`) and claimed by the worker's poller onto the standard scene
  flow; assembly is a claimed render request (`RENDERING` @ 0.9 → 0.92)
  that runs the real FFmpeg final render. Credits and plan length are
  enforced there.
- **Length controls defaulted past the plan.** The studio clamps the
  selected length, offers the plan ceiling when it sits below every preset,
  and the board warns before the worker would refuse. One source for the
  caps: `planCapSec` in `@cineforge/shared`.
- **Brand outro line** is now drawn on the closing card (font in the
  worker image).
- **Film score** — a fal text-to-music model composes one score per film,
  looped under the cut (`FAL_MUSIC_MODEL`, needs `FAL_KEY`).
- **Team invites** are emailed through Supabase Auth and marked accepted
  when the invitee joins (`supabase functions deploy team-invite`).

Still open (need product decisions or new infrastructure):

- **Paid marketplace** — listings, checkout and creator payouts (e.g.
  Stripe Connect) have no tables or flows; the Exchange marks paid
  catalogues as not open.
- **Public channel pages and channel access control** — screenings are
  private to their owner; publishing a public page needs a public flag,
  anonymous read policies and public playback copies.
- **Sound effects** — no SFX generator is wired; films render with
  narration and score.


## Studios are tools (docs/36 §0)

The create studios (Film, Series, Trailer, Shorts, Advert, New production)
do not use the editorial page treatment. They use `components/cf/StudioLayout.tsx`:

- `StudioPage`: a compact title row (title, Live/Preview badge, one-line
  subtitle) and optional `StudioTabs`. On desktop the room is exactly one
  viewport tall.
- `StudioGrid`: options on the left (they scroll inside the panel), a pinned
  footer with the summary and the Create button, and the preview filling the
  right. On phones the footer is a sticky bottom bar.
- `Field`, `Chips`, `UnlockRow`, `StudioFooter`, `ExampleShelf`: compact
  option groups, one plan-upsell line, and one-tap example briefs.

Rules: no `PageHeader`, no reel strip, and no process explainers in a
studio. Offer only options the plan can run. Create must be visible without
scrolling from 1366×768 up.
