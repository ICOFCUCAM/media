# 30 — Video ads & licensed stock

## Ads

A video ad is a short project with a fixed aspect/duration and (usually) a
call-to-action. **Ad presets** (`packages/shared/src/ads.ts`, `AD_PRESETS`) seed
those so a creator picks "TikTok / Reels" instead of hand-setting aspect +
length: YouTube pre-roll (16:9 / 15s), bumper (16:9 / 6s), TikTok-Reels-Shorts
(9:16 / 30s), Instagram feed (1:1 / 30s), story (9:16 / 15s), square promo.
Picking a preset sets the project's aspect + per-scene durations and reserves an
end card when `cta` is set.

## Licensed stock footage

For ad b-roll, source from **licensed** providers — **not** scraped/arbitrary
internet video, which carries copyright risk. `StockClient` /
`buildStockClient(env)` (`packages/model-adapters/src/stock/stock-client.ts`)
searches **Pexels** (`PEXELS_API_KEY`) or **Pixabay** (`PIXABAY_API_KEY`) and
returns normalized clips (`url`, dimensions, duration, **credit** for
attribution). A returned clip drops straight into the scene as a **reference
video** (video-to-video, docs/22) or a background plate. Unset keys → no stock
source (creators still upload their own footage).

> Attribution: surface `StockVideo.credit` in the UI and respect each provider's
> license terms. The platform never ingests unlicensed third-party video.
