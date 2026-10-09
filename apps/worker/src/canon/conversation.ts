/**
 * Director workspace chat (DirectorOS W9; migration 0042). The owner writes an
 * instruction in plain words; the worker reads it with the intelligence layer
 * (task edit_interpret), answers, and — when it is a canon change that passes
 * the edit command's strict schema — files an edit request (0039). The change
 * then goes through canon, locks and passes like any other edit; the model
 * never changes anything itself.
 */
import type { FilmPackage, Interpretation } from "@cineforge/movie";
import { CanonChangeSchema } from "./edits";

export interface OwnerMessage {
  id: string;
  projectId: string;
  userId: string | null;
  body: string;
}

export interface ConversationDeps {
  /** pending → answered; false when another worker took it. */
  claim(id: string): Promise<boolean>;
  loadPackage(projectId: string): Promise<FilmPackage | null>;
  available(): boolean;
  interpret(pkg: FilmPackage, text: string, projectId: string): Promise<Interpretation>;
  fileEdit(projectId: string, requestedBy: string | null, change: Record<string, unknown>): Promise<string>;
  reply(projectId: string, replyTo: string, body: string, editRequestId: string | null): Promise<void>;
}

export type ConversationOutcome = "edit_filed" | "answered" | "skipped";

export async function processDirectorMessage(msg: OwnerMessage, deps: ConversationDeps): Promise<ConversationOutcome> {
  if (!(await deps.claim(msg.id))) return "skipped";
  const say = async (body: string, editId: string | null = null) => deps.reply(msg.projectId, msg.id, body.slice(0, 2000), editId);
  try {
    const pkg = await deps.loadPackage(msg.projectId);
    if (!pkg) {
      await say("This film was planned before the Director could edit it by instruction. Re-plan it, or use the change form.");
      return "answered";
    }
    if (!deps.available()) {
      await say("The AI Director is not configured right now, so I can't read instructions. The change form still works.");
      return "answered";
    }
    const r = await deps.interpret(pkg, msg.body, msg.projectId);
    if (r.action !== "change" || !r.change) {
      await say(r.reply || "That isn't a change I can make to the film's canon.");
      return "answered";
    }
    const parsed = CanonChangeSchema.safeParse(r.change);
    if (!parsed.success) {
      await say(`${r.reply} — but I couldn't turn it into a valid change (${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}). Try naming the character and scene.`);
      return "answered";
    }
    const editId = await deps.fileEdit(msg.projectId, msg.userId, parsed.data as Record<string, unknown>);
    await say(`${r.reply} I've filed the change; only the shots it touches will regenerate.`, editId);
    return "edit_filed";
  } catch (e) {
    await say(`I couldn't read that just now (${(e instanceof Error ? e.message : String(e)).slice(0, 200)}). Please try again.`).catch(() => {});
    return "answered";
  }
}
