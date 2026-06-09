import { notFound } from "next/navigation";
import { WorkspacePage } from "../../../../components/WorkspacePage";

const SECTIONS: Record<string, { title: string; subtitle: string; headline: string; hint: string }> = {
  teams: {
    title: "Teams",
    subtitle: "Invite collaborators and organize them into production units.",
    headline: "Just you so far.",
    hint: "Add writers, directors and editors, and give each the right access to your productions.",
  },
  permissions: {
    title: "Permissions",
    subtitle: "Control who can create, edit, publish and spend.",
    headline: "Default roles in effect.",
    hint: "Fine-grained roles map to Supabase Auth — Creator, Studio Owner and Super Admin.",
  },
  brand: {
    title: "Brand Assets",
    subtitle: "Logos, intros, lower-thirds and color palettes applied across titles.",
    headline: "No brand kit yet.",
    hint: "Upload your brand kit and it'll be applied automatically to renders and publishing.",
  },
};

export function generateStaticParams() {
  return Object.keys(SECTIONS).map((section) => ({ section }));
}

export default function EnterpriseSectionPage({ params }: { params: { section: string } }) {
  const cfg = SECTIONS[params.section];
  if (!cfg) notFound();
  return (
    <WorkspacePage title={cfg.title} subtitle={cfg.subtitle} empty={{ headline: cfg.headline, hint: cfg.hint }} />
  );
}
