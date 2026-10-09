import { prisma } from "@cineforge/db";
import { providerUrl } from "@cineforge/shared";

/*
 * Finish notifications (docs/36 §5). When a production reaches READY or
 * FAILED, email the owner — only if they switched "Notify me" on in the
 * studio (users.notify_on_finish) and only when a mail provider is set
 * (RESEND_API_KEY + NOTIFY_FROM on a verified domain). With no provider configured this is a silent no-op; the
 * studio still shows the result live and, if allowed, a browser notification.
 */

type Outcome = "READY" | "FAILED";

export function notifyEnabled(): boolean {
  // Resend only sends from a verified domain, so both must be configured.
  return !!process.env.RESEND_API_KEY && !!process.env.NOTIFY_FROM;
}

export async function notifyFinish(projectId: string, outcome: Outcome, detail?: string): Promise<void> {
  if (!notifyEnabled()) return;
  try {
    const p = await prisma.project.findUnique({
      where: { id: projectId },
      select: { title: true, mode: true, user: { select: { email: true, notifyOnFinish: true } } },
    });
    if (!p || p.mode === "library" || !p.user.notifyOnFinish || !p.user.email) return;

    const app = (process.env.APP_URL || "").replace(/\/$/, "");
    const link = app ? `${app}/projects/${projectId}` : "";
    const subject = outcome === "READY" ? `Your film “${p.title}” is ready` : `“${p.title}” could not be finished`;
    const lines =
      outcome === "READY"
        ? [`“${p.title}” has finished rendering and is waiting in your projects.`]
        : [`“${p.title}” stopped before the final cut.`, detail ? `Reason: ${detail}` : ""];
    const text = [...lines, link && `Open it: ${link}`, "— Cineforge"].filter(Boolean).join("\n\n");

    const res = await fetch(`${providerUrl("resend")}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.NOTIFY_FROM, to: [p.user.email], subject, text }),
    });
    if (!res.ok) console.error(`[notify] ${outcome} email for ${projectId} failed: ${res.status} ${await res.text().catch(() => "")}`);
    else console.log(`[notify] ${outcome} email sent for ${projectId}`);
  } catch (e) {
    // A notification must never break the pipeline.
    console.error(`[notify] ${projectId}:`, e);
  }
}
