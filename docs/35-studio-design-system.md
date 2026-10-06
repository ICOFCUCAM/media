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
sign-in gate), `Pipeline` (department list driven by the run status).
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

## Known gaps surfaced by the redesign

These are engine or product questions, left untouched by the UI work:

- **Plan length caps are not enforced.** `MAX_FILM_SEC` only locks the
  length buttons; neither the create flow nor the worker clamps
  `target_seconds`. Free (30 s) cannot pick any film length, yet the
  default 2-minute selection still runs.
- **AI seed image** in the Director's Board records a placeholder seed —
  no image provider is wired to that action.
- **Paid marketplace, public channel pages, channel access control and a
  music engine** have no backend; the UI marks them as not open.
- **Team invites** are stored but not emailed (SMTP), and the **brand kit**
  is saved but not yet stamped onto renders.
