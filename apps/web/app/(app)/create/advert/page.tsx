"use client";

import { CreateStudio } from "../../../../components/CreateStudio";
import { AD_PRESETS } from "../../../../lib/ads";

/**
 * The Commercial Studio (docs/design/create-advert.html; advert channel,
 * docs/30) — a video ad is a short, placement-shaped project with a
 * call-to-action. The presets carry the right aspect + duration per
 * placement; the Director writes the spot, the same pipeline films it.
 */
export default function CreateAdvertPage() {
  return (
    <CreateStudio
      kind="advert"
      heading="Create an Advert"
      blurb="Pick a placement, describe the product and the feeling — the studio writes a spot with a call-to-action and films it in that exact format. Starting from a website? Plan it scene by scene in the Ads Studio (/ads) and send it here."
      durations={[
        { label: "6s bumper", value: 6 },
        { label: "15s", value: 15 },
        { label: "30s", value: 30 },
        { label: "60s", value: 60 },
        { label: "90s", value: 90 },
      ]}
      defaultSeconds={15}
      defaultPrompt="A 15-second advert for Flyttgo — drivers earn money with their own van. Energetic, optimistic, city scenes, end on the logo with the call to action: 'Drive. Deliver. Earn.'"
      platforms={AD_PRESETS.map((p) => ({ id: p.id, name: p.name, aspect: p.aspect, durations: [p.durationSec] }))}
      cta="Create advert"
    />
  );
}
