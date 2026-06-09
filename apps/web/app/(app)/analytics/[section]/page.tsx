import { notFound } from "next/navigation";
import { WorkspacePage, CardGrid } from "../../../../components/WorkspacePage";

const SECTIONS: Record<string, { title: string; subtitle: string; cards: { title: string; blurb: string }[] }> = {
  revenue: {
    title: "Revenue",
    subtitle: "Earnings across streaming, marketplace sales and licensing.",
    cards: [
      { title: "Streaming payouts", blurb: "Per-title revenue from connected streaming and ad platforms." },
      { title: "Marketplace sales", blurb: "Income from films, characters, worlds and voice packs you sell." },
      { title: "Licensing", blurb: "Rights deals and usage-based licensing of your assets." },
    ],
  },
  audience: {
    title: "Audience",
    subtitle: "Who's watching, where, and how they found you.",
    cards: [
      { title: "Reach", blurb: "Views and unique viewers across every published channel." },
      { title: "Retention", blurb: "Where viewers drop off, scene by scene." },
      { title: "Geography", blurb: "Top regions and languages for your content." },
    ],
  },
  performance: {
    title: "Performance",
    subtitle: "How each title performs across platforms.",
    cards: [
      { title: "Top titles", blurb: "Your best-performing films, shorts and episodes." },
      { title: "Platform mix", blurb: "Which channels drive the most engagement." },
      { title: "Trends", blurb: "Momentum week over week, by format." },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(SECTIONS).map((section) => ({ section }));
}

export default function AnalyticsSectionPage({ params }: { params: { section: string } }) {
  const cfg = SECTIONS[params.section];
  if (!cfg) notFound();
  return (
    <WorkspacePage title={cfg.title} subtitle={cfg.subtitle}>
      <CardGrid items={cfg.cards} />
    </WorkspacePage>
  );
}
