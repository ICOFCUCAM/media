/**
 * Talking with an avatar (DirectorOS W26; Part 3 §111, §117; migration 0059).
 *
 * The owner adds a line — typed, or recorded and transcribed here — and the
 * avatar answers through the pipeline CineForge already has:
 *
 *   pending user line → (speech recognition) → the Conversation call writes
 *   the avatar's reply in its persona → a Voice Studio reading in the
 *   avatar's voice (voiceovers) → when it is spoken, a talking-avatar video of
 *   the portrait (avatar_videos) → ready.
 *
 * One poller tick moves every turn one step; each step is claimed, so two
 * workers never answer the same line twice. A failure stops at that turn,
 * with its reason, and the conversation goes on.
 */
import { TALK_HISTORY, type TalkLine } from "@cineforge/movie";

export interface TurnRow {
  id: string;
  conversationId: string;
  userId: string;
  role: string;
  text: string | null;
  audioKey: string | null;
  status: string;
  voiceoverId: string | null;
  avatarVideoId: string | null;
}

export interface ConversationRow {
  id: string;
  userId: string;
  persona: string;
  voiceId: string | null;
  language: string;
  imageKey: string | null;
  quality: string;
  title: string;
}

export interface TalkDb {
  avatarTurn: {
    findMany(a: unknown): Promise<TurnRow[]>;
    updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
    create(a: { data: Record<string, unknown>; select?: Record<string, unknown> }): Promise<{ id: string }>;
  };
  avatarConversation: { findUnique(a: unknown): Promise<ConversationRow | null> };
  voiceover: {
    create(a: { data: Record<string, unknown>; select?: Record<string, unknown> }): Promise<{ id: string }>;
    findUnique(a: unknown): Promise<{ status: string; errorMessage: string | null } | null>;
  };
  avatarVideo: {
    create(a: { data: Record<string, unknown>; select?: Record<string, unknown> }): Promise<{ id: string }>;
    findUnique(a: unknown): Promise<{ status: string; errorMessage: string | null } | null>;
  };
}

export interface TalkDeps {
  /** Speech recognition of a recorded line (stored audio key → text). */
  transcribe(audioKey: string, language: string): Promise<string>;
  /** The avatar's reply in its persona. */
  reply(persona: string, language: string, lines: TalkLine[]): Promise<string>;
}

const err = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/** One tick: answer new lines, voice the replies, animate them, finish them. */
export async function advanceAvatarTalk(db: TalkDb, deps: TalkDeps): Promise<{ answered: number; voiced: number; finished: number; failed: number }> {
  const out = { answered: 0, voiced: 0, finished: 0, failed: 0 };
  const fail = async (id: string, from: string, e: unknown) => {
    await db.avatarTurn.updateMany({ where: { id, status: from }, data: { status: "failed", error: err(e) } });
    out.failed++;
  };

  // 1. The owner's new lines: understood, then answered.
  for (const t of await db.avatarTurn.findMany({ where: { role: "user", status: "pending" }, orderBy: { createdAt: "asc" }, take: 5 })) {
    if ((await db.avatarTurn.updateMany({ where: { id: t.id, status: "pending" }, data: { status: "thinking" } })).count !== 1) continue;
    try {
      const conv = await db.avatarConversation.findUnique({ where: { id: t.conversationId } });
      if (!conv) throw new Error("the conversation is gone");
      let text = t.text?.trim() ?? "";
      if (!text && t.audioKey) {
        text = (await deps.transcribe(t.audioKey, conv.language)).trim().slice(0, 2000);
        if (!text) throw new Error("nothing could be heard in the recording");
        await db.avatarTurn.updateMany({ where: { id: t.id }, data: { text } });
      }
      const earlier = await db.avatarTurn.findMany({
        where: { conversationId: t.conversationId, text: { not: null }, status: { not: "failed" } },
        orderBy: { createdAt: "asc" },
        select: { role: true, text: true, id: true },
      });
      const lines: TalkLine[] = earlier.filter((x) => x.id !== t.id).map((x) => ({ role: x.role as TalkLine["role"], text: x.text! }));
      lines.push({ role: "user", text });
      const reply = await deps.reply(conv.persona, conv.language, lines.slice(-TALK_HISTORY));
      const vo = await db.voiceover.create({
        data: {
          userId: conv.userId, voiceId: conv.voiceId, title: (conv.title || "Conversation").slice(0, 120), text: reply,
          language: conv.language, mode: "narrator", style: {}, speakers: [],
        },
        select: { id: true },
      });
      await db.avatarTurn.create({
        data: { conversationId: t.conversationId, userId: t.userId, role: "avatar", text: reply, status: "speaking", voiceoverId: vo.id },
        select: { id: true },
      });
      await db.avatarTurn.updateMany({ where: { id: t.id, status: "thinking" }, data: { status: "ready" } });
      out.answered++;
    } catch (e) {
      await fail(t.id, "thinking", e);
    }
  }

  // 2. Replies being spoken: once the reading is ready, animate the portrait (or finish, without one).
  for (const t of await db.avatarTurn.findMany({ where: { role: "avatar", status: "speaking" }, take: 10 })) {
    const vo = t.voiceoverId ? await db.voiceover.findUnique({ where: { id: t.voiceoverId }, select: { status: true, errorMessage: true } }) : null;
    if (!vo || vo.status === "FAILED") { await fail(t.id, "speaking", vo?.errorMessage ?? "the reply could not be spoken"); continue; }
    if (vo.status !== "READY") continue;
    const conv = await db.avatarConversation.findUnique({ where: { id: t.conversationId } });
    if (!conv?.imageKey) {
      if ((await db.avatarTurn.updateMany({ where: { id: t.id, status: "speaking" }, data: { status: "ready" } })).count) out.finished++;
      continue;
    }
    if ((await db.avatarTurn.updateMany({ where: { id: t.id, status: "speaking" }, data: { status: "animating" } })).count !== 1) continue;
    const av = await db.avatarVideo.create({
      data: { userId: conv.userId, voiceoverId: t.voiceoverId, title: (conv.title || "Conversation").slice(0, 120), imageKey: conv.imageKey, quality: conv.quality },
      select: { id: true },
    });
    await db.avatarTurn.updateMany({ where: { id: t.id }, data: { avatarVideoId: av.id } });
    out.voiced++;
  }

  // 3. Replies being animated: finished when the video is.
  for (const t of await db.avatarTurn.findMany({ where: { role: "avatar", status: "animating" }, take: 10 })) {
    if (!t.avatarVideoId) continue;
    const av = await db.avatarVideo.findUnique({ where: { id: t.avatarVideoId }, select: { status: true, errorMessage: true } });
    if (!av || av.status === "FAILED") { await fail(t.id, "animating", av?.errorMessage ?? "the avatar could not be animated"); continue; }
    if (av.status === "READY" && (await db.avatarTurn.updateMany({ where: { id: t.id, status: "animating" }, data: { status: "ready" } })).count) out.finished++;
  }
  return out;
}
