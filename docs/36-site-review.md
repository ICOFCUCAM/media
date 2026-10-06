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

## Upgrade roadmap

| Priority | Upgrade | Effort |
| --- | --- | --- |
| Now | Production domain + expire old previews (§11) | S |
| Now | Sticky mobile action bar (§2) | S |
| Next | Real poster frames from the worker (§4) | M |
| Next | Notify on READY/FAILED (§5) | M |
| Next | Example shelf / first run (§6) | M |
| Next | Plan-aware option display (§3) | S |
| Later | Single "New production" flow (§1) | L |
| Later | Marketplace waitlists (§7) | S |
| Later | Phone homepage condensation (§8) | M |
| Later | Card performance (§9), tablist semantics (§10) | S |

## Responsive baseline (this pass)

| Width | Layout |
| --- | --- |
| < 640 | Rail hidden; Index drawer; one column; mode bar scrolls sideways; homepage Menu |
| 640–1279 | Rail + Index drawer; studio splits stack until 1280 |
| ≥ 1280 | Rail + persistent navigator; studio two-column |
| Touch | 44px controls, 16px form text, 44px link hit areas |
