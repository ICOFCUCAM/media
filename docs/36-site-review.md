# 36 — Site review and upgrade path

A general critique of Cineforge as it stands after the studio redesign and the
phone/tablet pass, with upgrades ranked by impact. Evidence comes from the
production build audited at 360, 390, 768, 1024 and 1440px. Every route was
run in preview mode (no Supabase session), so signed-in, data-heavy states
(long project lists, admin tables) still need a pass with real data.

## What works

- **One coherent product.** Homepage and studio now share the dark room, the
  lime accent, Manrope headlines with serif italics, and drawn film frames.
  It reads as a creative tool, not a firm.
- **Honest states.** Preview runs say "Preview · not saved". Locked lengths
  say why. Missing backends say what to connect. Nothing pretends to
  render.
- **Real pipelines.** Create, Storyboard, Series, Trailer and Shorts drive the
  real worker queue with realtime progress. The plan cap and the brand
  outro are enforced in the worker, not just the UI.
- **Responsive.** No route overflows sideways at any width. Touch targets are
  44px, and form text is 16px so iOS does not zoom on focus.

## Critique

### 0. Studios were laid out like editorial pages (owner's note)
The redesign gave the create studios the homepage's editorial treatment:
huge titles, a three-frame film strip, a "production plan" spec sheet and a
pipeline that explained the production process. On a 1080p screen, Create
sat three scrolls down. The previous studio showed everything at once. Users
don't need the pipeline explained.

**Resolved:** studios are now tools (`components/cf/StudioLayout.tsx`).
There is a compact title row with mode tabs, brief and options on the left
with Create pinned under them, and the preview filling the right. The whole
room fits one screen at 1366×768 and up, with no page scroll. The pipeline
explainer is gone. The editorial treatment stays on the homepage and the
library, publishing and marketplace pages.


### 1. Too many front doors
"Create Anything" (7 types × 10 materials), the navigator's six Create
links, the seven Film modes and four separate studios all lead to
overlapping places. A new user meets three choices before writing one
sentence.

**Upgrade:** make Create Anything the single "New production" flow. Type,
then material, then the studio opens pre-configured. The navigator then
lists *productions*, not entry points.

### 2. The action is far from the idea
On a phone the Create button is about five screens below the prompt.
Specs, pipeline and preview sit in between.

**Upgrade:** a sticky bottom action bar on phones and tablets (runtime ·
ETA · Create). Collapse the spec list and pipeline behind "Details".

### 3. A free account feels locked
On Create Film, 4 of 5 lengths, 3 of 4 formats and the Cinematic tier are
greyed out. Honest, but it reads as "most of this isn't for you".

**Upgrade:** show only what the plan can run, plus one clear "unlock longer
films" row. Consider one free Cinematic render so people feel the top tier.

### 4. Drawn frames stand in for real ones
CinemaArt fixed the empty cards, but it is illustration. The strongest
upgrade available is *real* thumbnails:
- the worker saves a poster frame (`ffmpeg -frames:v 1`) for every finished
  shot and film, and project rows and RunPanel use it;
- characters get a portrait render at creation (seed-frame model already
  wired), worlds get an establishing shot;
- the homepage showreel needs real featured films; today it falls back to
  drawn frames.

### 5. Waiting is long and silent
"Ready in ~12 min" for a 30-second film is fine if people know when it's
done. Today they must keep the tab open.

**Upgrade:** email/push on READY and FAILED (Supabase function on the
project status change). Add a "Notify me" toggle next to Create.

### 6. No guided first run
A blank studio asks people to invent a film.

**Upgrade:** a "Start from an example" shelf (epic, noir, product spot,
music video) that fills the brief, length and style in one tap. It doubles
as marketing for the homepage.

### 7. The marketplace is mostly closed
Four of five catalogues say "Not open yet".

**Upgrade:** turn closed catalogues into waitlists (one tap, stored per
user). That captures demand data instead of showing dead ends.

### 8. Long pages, especially the homepage on phones
The homepage is about 16,700px tall at phone width: eleven sections plus
the language ticker.

**Upgrade:** on phones, fold Capabilities, Voice and Release into one
swipeable "The system" carousel, and keep Workspace, Showreel and Pricing.

### 9. Performance at scale
Each CinemaArt is inline SVG. Grids of hundreds (assets, projects) will add
DOM weight.

**Upgrade:** `content-visibility: auto` on cards, cap SVG detail on small
cards, and switch to real poster images as they arrive (§4).

### 10. Accessibility leftovers
- Many labels are 11px uppercase. Legible, but at the floor.
- The Film mode bar uses `aria-pressed` buttons. A `tablist` with arrow-key
  navigation would match its behaviour.
- The cream manifesto section is the only light block on the homepage. It
  is fine for contrast, but check it against the dark-only rule.

### 11. Deployment hygiene
Several Vercel preview URLs are live, and an old one still shows the
pre-redesign studio. Pin a production domain to the default branch and
protect or expire old previews so reviewers see the current site.

## Resolution (this pass)

| # | Upgrade | Status |
| --- | --- | --- |
| 0 | One-screen studios, no pipeline explainer | Done. Film, Series, Trailer, Shorts and Advert on `StudioLayout` |
| 1 | Single "New production" flow | Done. Create Anything is a compact chooser that opens the right studio; studio-owned types skip the material step |
| 2 | Create always in reach | Done. Pinned under the options on desktop; sticky bottom bar on phones and tablets; the preview scrolls into view after Create |
| 3 | Plan-aware options | Done. Only runnable lengths, formats and engines are offered, plus one "Unlock …" row (`UnlockRow`, `usePlan`) |
| 4 | Real poster frames | Done. Project rows and the finished-film player use `films.poster_key` (already written by the render engine); drawn frames remain the fallback |
| 5 | Notify on READY/FAILED | Done. "Notify me" toggle (`NotifyToggle`): browser notification when the tab is hidden, plus email from the worker (`apps/worker/src/notify.ts`) |
| 6 | Example shelf | Done. One-tap briefs in every studio (`ExampleShelf`) |
| 7 | Marketplace waitlists | Done. Closed catalogues take one-tap waitlist sign-ups (`WaitlistButton`, table `marketplace_waitlist`) |
| 8 | Shorter homepage on phones | Done. Capabilities, showreel, marketplace and pricing swipe sideways; release channels collapse to five. About 16,700px down to about 10,500px at 360px wide |
| 9 | Deployment hygiene | Done in code: preview builds show a "Preview build · sha · branch" badge with a link to the live site, and are `noindex`. The Vercel settings below still need doing |

### To switch on
- **Migration 0012** (`packages/db/supabase/migrations/0012_notify_and_waitlist.sql`):
  adds `users.notify_on_finish` and `marketplace_waitlist`. Until it runs, the
  notify toggle offers browser notifications only, and the waitlist button
  reports that it could not join.
- **Email notifications:** set `RESEND_API_KEY`, `NOTIFY_FROM` (an address on
  a domain verified in Resend) and `APP_URL` on the worker. Without them,
  email is skipped silently.
- **Vercel** (dashboard; can't be done from code):
  1. Project → Settings → Domains: attach the production domain to the
     default branch.
  2. Set `NEXT_PUBLIC_SITE_URL` to that domain, so the preview badge links
     to it.
  3. Settings → Deployment Protection: protect preview deployments (Vercel
     Authentication), so old preview URLs are not public.
  4. Keep "Automatically expose System Environment Variables" on. The badge
     reads `VERCEL_ENV` and the commit SHA and branch.

## Responsive baseline (this pass)

| Width | Layout |
| --- | --- |
| < 640 | Rail hidden; Index drawer; one column; mode bar scrolls sideways; homepage Menu |
| 640–1279 | Rail + Index drawer; studio splits stack until 1280 |
| ≥ 1280 | Rail + persistent navigator; studio two-column |
| Touch | 44px controls, 16px form text, 44px link hit areas |
