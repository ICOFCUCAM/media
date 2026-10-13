# 47 — CineForge Ads Studio

**Status:** the page is live in code at `/ads` (2026-10-09; website
intelligence, brand assets and live scene edits connected 2026-10-10), built from the
owner's design `docs/design/cineforge_ad_studio.html`: same copy, same images (Unsplash,
as in the design), same layout and interactions. It is a standalone product
page — no studio chrome — so it can run on its own domain.

## 1. What it does today

| Part | State |
|---|---|
| Landing (hero, capabilities, workflow, plans) | The design, verbatim |
| Studio panel: URL, brief, duration, direction, approach, voice, formats | Works in the browser |
| **Website analysis ("Analyse")** | **Real (A2, 2026-10-10; W32 2026-10-13):** the page is fetched on our server and read by the model when one is configured — otherwise, or when the model call fails, from the page's own title, description, headings, lists and buttons; only facts quoted from the page are kept either way, and the page's own pictures come back for the storyboard (§5, §8) |
| **Uploads** | **Real for images (A3):** a logo and up to 8 product photos (PNG / JPEG / WebP, ≤ 15 MB) are uploaded to the owner's account and recorded on the advert; other files (video, PDF, SVG, audio) stay in the browser and are marked so (§6) |
| **Storyboard + scene editor** | **Real (W32):** written by the Ads Studio writer from whatever is given — a brief, the page's facts, brand files, direction, length, voice (a link is optional). Each scene's look and line can be edited, rewritten ("Regenerate scene plan") or given a picture ("Add image to this scene" sends it to production as a product photo). Script / assembly modals and JSON export as in the design (§8) |
| **Storyboard on a produced ad** | **Real (A5):** pick one of your adverts in the storyboard selector (or open `/ads?project=<id>`, linked from an advert's production file); a scene edit goes to the Director chat and only the shots it touches regenerate (§7) |
| **Produce this ad in CineForge** | **Real (W32):** the edited storyboard becomes the advert's full plan (Film IR, held to the Director's validators) and **one advert per selected format** is created with it (`projects.supplied_plan`), the page's facts and the brand files; the worker makes the scene stills, the video, the voice-over (unless "No narration"), music and sound, and renders the film with the logo card — no Director call. The produced ad opens in the storyboard selector (§8) |

The page keeps the design's capability copy. Lines that described the page as
an unconnected prototype were changed to say what is connected and what is
still a preview (the six-scene plan on the page itself).

## 2. Its own domain (owner step, when wanted)

1. Add the domain to the Vercel project of `apps/web` (Settings → Domains).
2. Set `ADS_STUDIO_HOSTS=<domain>` (comma-separated for several, e.g. the
   apex and `www.`) in the project's environment variables and redeploy.
3. The root of that domain now serves the Ads Studio (`middleware.ts`
   rewrites `/` → `/ads` for those hosts only); the main CineForge site is
   unchanged. Sign-in, billing and the Advert studio stay on the same app.

## 3. Commercial model (planned — not on sale)

Owner direction (2026-10-08): Ads Studio as its own subscription product —
**pay as you go from $10 per ad**, or a **monthly plan**. Recorded in
`apps/web/lib/ads-studio.ts` (`ADS_STUDIO_COMMERCIAL`, status `planned`). The
page still shows the design's illustrative tiers and says pricing is not
configured, because nothing can be bought yet.

To launch it:
1. Measure the real cost of one ad (GPU seconds per 15/30/60 s at each
   resolution, retries, planning call, voice, storage) from `video_generations`
   and `ai_decisions` after the worker deploy; set the $10 tier's limits
   (length, format, revisions) so it is profitable.
2. Create the Stripe products (one-off "Ad" credit pack at $10; monthly plans)
   and map them to credits; one ad debits its estimate like any production.
3. Turn the "Explore tier" buttons into checkout links and add the prices to
   the page.

## 4. Roadmap (DirectorOS map, workstream WA)

| Id | Item | State |
|---|---|---|
| A1 | Ads Studio page + hand-off to the real advert pipeline + own-domain routing | done |
| A2 | Website intelligence: fetch a permitted page server-side, extract product, benefits, audience, CTA with source quotes; the Director plans from these facts and flags unsupported claims | done (2026-10-10) — §5 |
| A3 | Brand assets into production: uploads stored per project; the logo as an exact insert on the closing card, product photos as generation references | done (2026-10-10) — §6 |
| A4 | Billing for the standalone product (§3) | open — cost measurement after the deploy |
| A5 | Scene-level edit/regenerate on the real project | done (2026-10-10) — §7 |
| A6 | Works without model credit: website reading from the page's structure, storyboard and full plan written by the Ads Studio writer, one advert per format | done (2026-10-13, W32) — §8 |

## 5. Website intelligence (A2)

**Where:** `POST /api/ads/analyse` (`apps/web/app/api/ads/analyse/route.ts`),
signed-in users only (the Supabase access token as a Bearer header).

1. **Fetch** (`packages/movie/src/intelligence/site-fetch.ts`): http/https
   only, ports 80/443 only, no credentials in the URL. The host is resolved
   and **every** address must be public — loopback, private, link-local
   (incl. 169.254.169.254), CGNAT, multicast, reserved, documentation,
   NAT64/6to4/Teredo and IPv4-mapped ranges are refused — and the connection
   is pinned to the addresses that were checked (no DNS rebinding between the
   check and the connect). At most 3 redirects, each hop checked again;
   `text/html` (or XHTML) only; 1.5 MB cap counted after decompression;
   10 s for the whole fetch.
2. **Readable text** (`htmlToText`): title, meta description and body text,
   one block per line; scripts, styles, SVG, iframes and markup dropped.
   Pages whose text is drawn by JavaScript yield almost nothing and are
   refused with that reason.
3. **Reading** (task `site_analysis`, prompt `ads.site_analysis` v1, owned by
   the Director role): the model returns facts — product, benefits (≤ 6),
   audience (≤ 3), call to action — each with a short quote. **Every quote is
   checked against the page text** (`findQuote`: case, curly quotes, dashes
   and line breaks may differ, the words may not) and stored as the page
   writes it; a fact whose quote is not on the page is dropped and counted.
   The page text is passed as data and the prompt says to ignore instructions
   in it.
4. **Shown** under the URL field (kind, statement, quote) and **included in
   the hand-off brief** ("Source facts from the page (claim nothing beyond
   them)").
5. **Recorded on the advert** as `projects.ad_source` (migration 0060). The
   Director's plan request for every advert has a `SOURCE FACTS` section
   (`renderPlanRequest`, `director.master` v9 / `director.revision` v7 rules):
   every claim about the product must be one of the facts. An advert made
   without an analysed page is told to make no specific claims.
6. **Claim check** (deterministic, `claimAdvisories` in
   `packages/movie/src/intelligence/site.ts`): after planning, every
   narration and dialogue sentence of an advert that states a number
   (incl. prices and percentages), a superlative (best, fastest, #1, leading…)
   or a guarantee (guaranteed, risk-free, money-back, proven…) that no fact
   quote states is recorded as **`CLAIM_UNSUPPORTED`** (warning) in "What this
   production ran without", and shown in the Ads Studio when the ad is open
   there. The line is not rewritten.

**Configuration:** the web deployment needs a model for `site_analysis`:
`ANTHROPIC_API_KEY` (default route, `ANTHROPIC_MODEL` or claude-opus-5-5), or
an `INTELLIGENCE_ROUTES` entry `site_analysis=…` (with `OPENAI_API_KEY` for
an OpenAI route). Without one the route answers 503 and the page says
analysis is not configured. No new variable names.

**Limits:** the decision of each call is a JSON `ai.decision` line in the web
server log, not an `ai_decisions` row (the web has no service role, and there
is no project yet). One page per analysis (no crawling of linked pages). No
rate limit beyond sign-in. The facts are written by the owner's browser into
their own project, so an owner could edit them; they only steer the owner's
own advert and its advisories. The claim check reads narration and dialogue,
not on-screen text in shot actions, and runs after planning only — a later
scene revision through the Director chat is not re-checked.

## 6. Brand assets into production (A3)

**Upload:** "Produce this ad in CineForge" uploads files marked *Logo* or
*Product photo* to `cineforge-assets/brand/<the owner's id>/<uuid>.<ext>`
(the owner-folder storage policy of 0059 now includes `brand/`), then opens
`/create/advert?…&handoff=<id>`. The Advert studio shows what came with the
brief and, on create, records the files in **`brand_assets`** (migration
0060; one logo, ≤ 8 product photos, PNG/JPEG/WebP, adverts only, added while
the advert waits as DRAFT, exactly like a cast) before queueing it.

**In the worker:**

- **Logo → exact insert.** `brandOutro` (`apps/worker/src/render/profile.ts`)
  returns the advertiser's logo for an advert, on any plan, with the page's
  call-to-action quote as the line (the owner's brand-kit colour if they have
  one). The render engine's existing outro card overlays it unaltered (scaled
  to 320 px wide) as a 2.5 s closing card — so the master runs 2.5 s longer
  than the planned length. A logo that cannot be fetched or drawn is recorded
  as `BRAND_OUTRO_SKIPPED` by the engine.
- **Product photos → generation references.** The Director is told the
  product is the prop `prop_product` and to list it in every shot that shows
  it. Those shots' seed stills are drawn with the photos first in their
  references (`productReferenceKeys`, `apps/worker/src/canon/brand-refs.ts`;
  previs and final passes), and the photos join the shot's video reference
  pack.
- **When a file cannot be used** it is recorded as **`BRAND_ASSET_UNUSED`**:
  the plan shows the product in no shot; the production draws no stills (no
  image provider — seed stills need `OPENAI_API_KEY`, `DIRECTOR_SEED_FRAMES`
  not `0`); a product shot's still was drawn from text only (the configured
  image provider takes no references, e.g. `openai-image`); or no still could
  be drawn for it.

**Limits:** the product is matched by the plan's `prop_product`, so a plan
that shows the product without listing it gets no references for those shots
(and says so when no shot lists it). Reference conditioning is only as exact
as the image provider: the photos guide the still, they are not composited
into it. Video, PDF, SVG and audio uploads are not used in production.

## 7. Scene edit / regenerate on the live advert (A5)

The storyboard's selector lists the owner's adverts (`projects.kind =
'advert'`). With one open, the cards are the planned scenes (heading,
summary, the first shot's frame, status). Editing a scene and pressing
**Regenerate this scene** sends Director instructions through
`director_messages` — the Director workspace's own path, nothing parallel:

- what the scene shows and its spoken line → one instruction the Director
  reads as a `scene_revision` (look, light, camera, music, lines); it files
  an edit request, canon and locks are checked, and only the shots it touches
  regenerate (or it is refused with the reason);
- a new length → a second instruction, which the Director hands to the
  Editor; the cut is proposed for approval in the Director workspace.

The Director's answers, the edit requests' status (applied / rejected with
reasons / regenerating shot count) and the advert's `CLAIM_UNSUPPORTED` /
`BRAND_ASSET_UNUSED` notes are shown under the storyboard, refreshed every
8 s. An advert's production file links to it (`/ads?project=<id>`).

**Limits:** it needs the owner signed in on the same domain (an Ads Studio
served on its own domain has its own session); the Director makes at most one
change per instruction and decides how to read it; a scene's heading is not
editable from here; edits to a film planned before the Film IR are answered
with the Director's existing "re-plan it" reply.


## 8. The studio without a model (W32, 2026-10-13)

The studio produces a complete advert with no model call, from any of its
inputs — a link is one option, not a requirement.

- **Reading a page** (`packages/movie/src/intelligence/site-extract.ts`): with no
  model for `site_analysis`, or when the model call fails (spent credit), the
  page's own structure is read — description → product, short headings and list
  items → benefits, a "for / built for / helps" sentence → audience, the first
  button or link that asks to act → call to action. Every quote passes
  `verifyFacts`, as a model's must. The page's share image, large images and
  logo come back for the storyboard. The answer says which reading it was
  (`method: model | extract`).
- **Writing the storyboard** (`packages/movie/src/ads/advert-plan.ts`,
  `POST /api/ads/storyboard`): the length decides the beats (15 s: opening,
  solution, call to action; 30 s and longer: opening, problem, solution, how it
  works, outcome, call to action) and how many five-second scenes each gets.
  Each beat's line is the owner's brief or a quote from the page, chosen to fit
  its time at a natural speaking pace (`AD_WORDS_PER_SCENE`); nothing is
  claimed that the advertiser did not write.
- **Producing** (`POST /api/ads/produce`): the edited storyboard becomes a Film IR
  package — one five-second shot per scene (the worker's advert constraints,
  `advertConstraints` = `constraintsFor`, tested), the customer where the story
  is about them, `prop_product` wherever the product is shown (so product photos
  are the shots' references), narration split across the beat's scenes, the
  creative direction as palette, light, lens, camera and score. It must pass
  `validateFilmPackage`; then one advert project per format is created as the
  signed-in user with `supplied_plan`, `ad_source` and `brand_assets`.
- **Still needing a model:** scene edits on a produced ad go through the
  Director chat (§7), which needs a model; on an ad with no model, change the
  storyboard on the page and produce it again. A cloned voice or uploaded
  narration is not yet selectable here: the narrator reads the lines.
