import { notFound } from "next/navigation";
import { WorkspacePage } from "../../../../components/WorkspacePage";

const SECTIONS: Record<string, { title: string; subtitle: string; headline: string; hint: string }> = {
  characters: {
    title: "Characters",
    subtitle: "Your reusable cast — locked identity, wardrobe and voice.",
    headline: "No characters yet.",
    hint: "Characters you create are saved here and can be reused across any project, keeping their exact look.",
  },
  worlds: {
    title: "Worlds",
    subtitle: "Locations, lore and continuity bibles you can film in again.",
    headline: "No worlds yet.",
    hint: "Build a world once — its locations and rules stay consistent across every scene and episode.",
  },
  voices: {
    title: "Voices",
    subtitle: "Cloned and designed voices for narration and dialogue.",
    headline: "No voices yet.",
    hint: "Design or clone a voice and assign it to any character for consistent delivery.",
  },
  music: {
    title: "Music",
    subtitle: "Original scores and cues generated for your projects.",
    headline: "No tracks yet.",
    hint: "Scores are composed to match each scene's mood and are reusable across your library.",
  },
};

export function generateStaticParams() {
  return Object.keys(SECTIONS).map((section) => ({ section }));
}

export default function LibrarySectionPage({ params }: { params: { section: string } }) {
  const cfg = SECTIONS[params.section];
  if (!cfg) notFound();
  return (
    <WorkspacePage
      title={cfg.title}
      subtitle={cfg.subtitle}
      empty={{ headline: cfg.headline, hint: cfg.hint }}
    />
  );
}
