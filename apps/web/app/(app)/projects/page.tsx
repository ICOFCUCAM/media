import { WorkspacePage } from "../../../components/WorkspacePage";

export const metadata = { title: "Projects — Cineforge" };

export default function ProjectsPage() {
  return (
    <WorkspacePage
      title="Projects"
      subtitle="Every film, series, trailer and short you're working on."
      action={{ label: "New project", href: "/create/film" }}
      empty={{
        headline: "No projects yet.",
        hint: "Start in the Studio — your films and series will collect here, with status and final cuts.",
      }}
    />
  );
}
