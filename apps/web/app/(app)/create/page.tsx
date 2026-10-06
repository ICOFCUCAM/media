import { CreateGate } from "../../../components/cf/CreateGate";
import { StudioPage } from "../../../components/cf/StudioLayout";

export const metadata = { title: "New production — Cineforge" };

/**
 * The one way into a new production. Pick what you're making and what you
 * already have; the right studio opens pre-configured. A project can begin
 * from any asset — a brief, a script, a storyboard, an image, a clip,
 * narration, a character or a world.
 */
export default function CreateHub() {
  return (
    <StudioPage title="New production" subtitle="Pick what you're making and what you already have — the right studio opens ready to go." scroll>
      <CreateGate />
    </StudioPage>
  );
}
