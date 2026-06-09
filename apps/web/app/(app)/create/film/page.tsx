import { CreateStudio } from "../../../../components/CreateStudio";
import { productById } from "../../../../lib/products";

export const metadata = { title: "Create a Film — Cineforge" };

export default function CreateFilmPage() {
  const p = productById("film")!;
  return (
    <CreateStudio
      kind="film"
      heading="Create a Feature Film"
      blurb="One prompt becomes a full film — screenplay, cast, locations, score and a streamable final cut."
      durations={p.durations}
      defaultSeconds={p.defaultSeconds}
      defaultPrompt="An epic about an African kingdom fighting for its independence, told over three generations."
      cta="Create film"
    />
  );
}
