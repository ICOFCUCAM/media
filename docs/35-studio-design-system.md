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
