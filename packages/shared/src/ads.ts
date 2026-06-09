/**
 * Ad format presets (docs/30). A video ad is just a short project with a fixed
 * aspect/duration and (usually) a call-to-action. Presets seed those so a
 * creator picks "TikTok ad" instead of hand-setting aspect + length. Pure data.
 */
export type AdAspect = "16:9" | "9:16" | "1:1";

export interface AdPreset {
  id: string;
  name: string;
  platform: string;
  aspect: AdAspect;
  durationSec: number;
  cta: boolean; // reserve an end card for a call-to-action
  note?: string;
}

export const AD_PRESETS: AdPreset[] = [
  { id: "yt-preroll", name: "YouTube pre-roll", platform: "YouTube", aspect: "16:9", durationSec: 15, cta: true },
  { id: "yt-bumper", name: "YouTube bumper", platform: "YouTube", aspect: "16:9", durationSec: 6, cta: false, note: "non-skippable, no CTA" },
  { id: "tiktok-reels", name: "TikTok / Reels / Shorts", platform: "TikTok", aspect: "9:16", durationSec: 30, cta: true },
  { id: "ig-feed", name: "Instagram feed", platform: "Instagram", aspect: "1:1", durationSec: 30, cta: true },
  { id: "story-15", name: "Story / status ad", platform: "Multi", aspect: "9:16", durationSec: 15, cta: true },
  { id: "square-promo", name: "Square promo", platform: "Multi", aspect: "1:1", durationSec: 30, cta: true },
];

const byId = new Map(AD_PRESETS.map((p) => [p.id, p]));

export function adPreset(id: string): AdPreset | undefined {
  return byId.get(id);
}
