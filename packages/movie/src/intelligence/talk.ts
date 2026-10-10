/**
 * The avatar's side of a conversation (DirectorOS W26; Part 3 §111, §117).
 * One structured call per turn: the persona, the language and the recent
 * lines go in; one short spoken reply comes out. The caller voices it and
 * animates the portrait with it.
 */
import { PROMPTS } from "./prompts";
import type { IntelligenceRouter } from "./router";

export interface TalkLine {
  role: "user" | "avatar";
  text: string;
}

/** Most lines of history sent with each turn (Part 1 §92: only what the turn needs). */
export const TALK_HISTORY = 12;
/** Longest spoken reply kept (about forty seconds). */
export const TALK_MAX_CHARS = 600;

const SCHEMA = {
  type: "object",
  properties: { reply: { type: "string", description: "what the avatar says next, as spoken words" } },
  required: ["reply"],
};

/** The request text for one turn (pure). */
export function talkRequest(persona: string, language: string, lines: TalkLine[]): string {
  return JSON.stringify({
    persona: persona.trim().slice(0, 2000),
    language,
    conversation: lines.slice(-TALK_HISTORY).map((l) => ({ who: l.role === "user" ? "person" : "you", said: l.text.slice(0, 2000) })),
  });
}

/** Trim a reply to what can be spoken (pure): no markup, whole sentences within the limit. */
export function speakable(reply: string): string {
  const flat = reply.replace(/[*_#`>|]/g, "").replace(/\s+/g, " ").trim();
  if (flat.length <= TALK_MAX_CHARS) return flat;
  const cut = flat.slice(0, TALK_MAX_CHARS);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return (end > 80 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…").trim();
}

export async function avatarReply(
  router: IntelligenceRouter,
  persona: string,
  language: string,
  lines: TalkLine[],
  ctx: { projectId?: string | null } = {},
): Promise<string> {
  const p = PROMPTS.avatarTalk;
  const res = await router.call({
    task: "conversation", promptId: p.id, promptVersion: p.version, system: p.system,
    user: talkRequest(persona, language, lines),
    schema: SCHEMA, schemaName: "AvatarReply", maxTokens: 800, effort: "low",
    summarize: (o) => `Replied in character: ${String((o as { reply?: string } | null)?.reply ?? "").slice(0, 160)}`,
  }, ctx);
  const reply = speakable(String((res.output as { reply?: unknown } | null)?.reply ?? ""));
  if (!reply) throw new Error("the avatar had nothing to say");
  return reply;
}
