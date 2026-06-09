import { redirect } from "next/navigation";

// The Studio is now the creator workspace; films are made under /create/film.
export default function StudioRedirect() {
  redirect("/create/film");
}
