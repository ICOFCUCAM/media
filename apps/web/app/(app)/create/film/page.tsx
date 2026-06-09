import { FilmStudio } from "../../../../components/FilmStudio";

export const metadata = { title: "Create a Film — Cineforge" };

// Live, Supabase-backed when env is configured; falls back to the preview engine
// (CreateStudio) otherwise. Auth, project persistence and Realtime progress all
// run through Supabase. See docs/25-supabase.md.
export default function CreateFilmPage() {
  return <FilmStudio />;
}
