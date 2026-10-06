import { CreateGate } from "../../../components/cf/CreateGate";
import { PageHeader } from "../../../components/cf/primitives";

export const metadata = { title: "Create — Cineforge" };

/**
 * The production gate. A project can begin from any asset — a brief, a
 * script, a storyboard, an image, an existing clip, narration, a character or
 * a world. Pick what you're making, then what you already have.
 */
export default function CreateHub() {
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="Production gate / 01"
        title={<>Make<br /><em>something.</em></>}
        copy={
          <>
            <p>Cineforge does not begin with a prompt box.</p>
            <p>Begin with the work itself. Choose what you are making, then tell the studio what you already have.</p>
            <p><strong>The production path follows from there.</strong></p>
          </>
        }
        status={{ label: "Studio ready" }}
      />
      <CreateGate />
    </div>
  );
}
