// Team invites (Enterprise → Teams). Called by the web app with the owner's
// JWT. Two actions:
//   send — email the invite through Supabase Auth (auth.admin.inviteUserByEmail
//          uses the project's auth email / SMTP settings);
//   sync — mark the owner's pending invites ACCEPTED once that email has a
//          Cineforge account (public.users, written by the auth trigger).
// Ownership is checked with the caller's own client, so RLS decides which
// invites they may act on; only the email + status writes use the service role.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL")!;
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth } = await asCaller.auth.getUser();
  const user = auth?.user;
  if (!user) return json({ error: "Sign in first." }, 401);

  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!service) return json({ error: "Invites aren't enabled yet (service role not configured)." }, 503);
  const admin = createClient(url, service);

  const { action, inviteId, redirectTo } = (await req.json().catch(() => ({}))) as {
    action?: "send" | "sync";
    inviteId?: string;
    redirectTo?: string;
  };

  if (action === "send") {
    if (!inviteId) return json({ error: "inviteId required" }, 400);
    // RLS: the caller only sees their own invites.
    const { data: invite } = await asCaller.from("team_invites").select("id,email,role,status").eq("id", inviteId).maybeSingle();
    if (!invite) return json({ error: "Invite not found." }, 404);
    if (invite.status === "REVOKED") return json({ error: "This invite was revoked." }, 409);

    const { error } = await admin.auth.admin.inviteUserByEmail(invite.email, {
      redirectTo: redirectTo ?? undefined,
      data: { invited_by: user.id, team_role: invite.role },
    });
    if (error) {
      // Already a Cineforge member: nothing to email — count them as joined.
      if (/already been registered|already exists/i.test(error.message)) {
        await admin.from("team_invites").update({ status: "ACCEPTED" }).eq("id", invite.id);
        return json({ sent: false, member: true, message: `${invite.email} already has a Cineforge account — added as a member.` });
      }
      return json({ error: error.message }, 502);
    }
    return json({ sent: true, message: `Invite emailed to ${invite.email}.` });
  }

  if (action === "sync") {
    const { data: pending } = await asCaller.from("team_invites").select("id,email").eq("status", "PENDING");
    const emails = (pending ?? []).map((i) => i.email.toLowerCase());
    if (!emails.length) return json({ accepted: 0 });
    const { data: members } = await admin.from("users").select("email").in("email", emails);
    const joined = new Set((members ?? []).map((m) => (m.email as string).toLowerCase()));
    const ids = (pending ?? []).filter((i) => joined.has(i.email.toLowerCase())).map((i) => i.id);
    if (ids.length) await admin.from("team_invites").update({ status: "ACCEPTED" }).in("id", ids);
    return json({ accepted: ids.length });
  }

  return json({ error: "Unknown action." }, 400);
});
