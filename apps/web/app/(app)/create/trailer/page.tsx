import { CreateStudio } from "../../../../components/CreateStudio";
import { productById } from "../../../../lib/products";

export const metadata = { title: "Create a Trailer — Cineforge" };

export default function CreateTrailerPage() {
  const p = productById("trailer")!;
  return (
    <CreateStudio
      kind="trailer"
      heading="Trailer Studio"
      blurb="Cut a high-impact trailer or teaser — beats, voiceover and a music sting, paced for the algorithm."
      durations={p.durations}
      defaultSeconds={p.defaultSeconds}
      defaultPrompt="A suspenseful teaser trailer for a sci-fi heist movie set on a derelict space station."
      cta="Create trailer"
    />
  );
}
