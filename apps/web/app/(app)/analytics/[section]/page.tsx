import { notFound } from "next/navigation";
import { AnalyticsSection } from "../../../../components/analytics/AnalyticsSection";

const SECTIONS = ["revenue", "audience", "performance"] as const;
type Section = (typeof SECTIONS)[number];

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section }));
}

export default function AnalyticsPage({ params }: { params: { section: string } }) {
  if (!SECTIONS.includes(params.section as Section)) notFound();
  return <AnalyticsSection section={params.section as Section} />;
}
