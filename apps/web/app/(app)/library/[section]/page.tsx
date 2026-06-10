import { notFound } from "next/navigation";
import { WorkspacePage } from "../../../../components/WorkspacePage";

// Characters and Worlds have dedicated routes (real creators); this dynamic
// route covers the remaining library sections.
const SECTIONS: Record<string, { title: string; subtitle: string; headline: string; hint: string }> = {
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
