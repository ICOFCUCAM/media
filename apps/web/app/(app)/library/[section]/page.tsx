import { notFound } from "next/navigation";
import { WorkspacePage } from "../../../../components/WorkspacePage";

// Characters and Worlds have dedicated routes (real creators); this dynamic
// route covers the remaining library sections.
const SECTIONS: Record<string, { title: string; subtitle: string; headline: string; hint: string }> = {
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
