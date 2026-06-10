import { notFound } from "next/navigation";
import { TeamsPage } from "../../../../components/enterprise/TeamsPage";
import { BrandPage } from "../../../../components/enterprise/BrandPage";
import { PermissionsPage } from "../../../../components/enterprise/PermissionsPage";

const SECTIONS = ["teams", "permissions", "brand"] as const;

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section }));
}

export default function EnterpriseSectionPage({ params }: { params: { section: string } }) {
  if (params.section === "teams") return <TeamsPage />;
  if (params.section === "permissions") return <PermissionsPage />;
  if (params.section === "brand") return <BrandPage />;
  notFound();
}
