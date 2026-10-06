"use client";

import { CreateStudio } from "../../../../components/CreateStudio";
import { PageHeader } from "../../../../components/cf/primitives";
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
      blurb=""
      header={
        <PageHeader
          eyebrow="Commercial studio / Brand film"
          title={<>Make the<br /><em>case.</em></>}
          copy={
            <>
              <p>Build a commercial that gives a product, service or idea a reason to matter. Pick a placement, describe the product and the feeling.</p>
              <p><strong>The Director writes a spot with a call-to-action; the studio films it in the placement&apos;s exact format.</strong></p>
            </>
          }
          status={{ label: "Commercial studio ready" }}
        />
      }
      durations={[
        { label: "6s bumper", value: 6 },
        { label: "15s", value: 15 },
        { label: "30s", value: 30 },
        { label: "60s", value: 60 },
      ]}
      defaultSeconds={15}
      defaultPrompt="A 15-second advert for Flyttgo — drivers earn money with their own van. Energetic, optimistic, city scenes, end on the logo with the call to action: 'Drive. Deliver. Earn.'"
      platforms={AD_PRESETS.map((p) => ({ id: p.id, name: p.name, aspect: p.aspect, durations: [p.durationSec] }))}
      cta="Create advert"
    />
  );
}
