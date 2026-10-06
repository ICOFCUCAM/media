import { notFound } from "next/navigation";
import { CreatorView } from "../../../../components/views/CreatorView";

const VIEWS = ["creator", "studio", "super"] as const;

export function generateStaticParams() {
  return VIEWS.map((role) => ({ role }));
}

export function generateMetadata({ params }: { params: { role: string } }) {
  return { title: `Viewing as ${params.role.charAt(0).toUpperCase()}${params.role.slice(1)} — Cineforge` };
}

/** VIEW family: the same system seen as a Creator, a Studio or a Super admin. */
export default function ViewPage({ params }: { params: { role: string } }) {
  if (params.role === "creator") return <CreatorView />;
  notFound();
}
