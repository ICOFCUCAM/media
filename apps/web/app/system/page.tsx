import { redirect } from "next/navigation";

// Infrastructure now lives in the gated Super Admin area, out of the creator view.
export default function SystemRedirect() {
  redirect("/admin");
}
