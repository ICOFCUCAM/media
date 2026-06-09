import { CreateStudio } from "../../../../components/CreateStudio";
import { productById, SHORT_PLATFORMS } from "../../../../lib/products";

export const metadata = { title: "Create Shorts — Cineforge" };

export default function CreateShortsPage() {
  const p = productById("shorts")!;
  return (
    <CreateStudio
      kind="shorts"
      heading="Short-Form Studio"
      blurb="Vertical, scroll-stopping clips sized for every feed — TikTok, Shorts, Reels, Snapchat and Pinterest."
      durations={p.durations}
      defaultSeconds={p.defaultSeconds}
      defaultPrompt="A 15-second oddly-satisfying clip of a tiny chef plating a miniature gourmet dish."
      platforms={SHORT_PLATFORMS}
      cta="Create short"
    />
  );
}
