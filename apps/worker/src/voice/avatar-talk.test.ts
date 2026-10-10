import { describe, expect, it } from "vitest";
import { advanceAvatarTalk, type ConversationRow, type TalkDb, type TurnRow } from "./avatar-talk";
import { findText, transcribe } from "./transcribe";

const conv: ConversationRow = { id: "c1", userId: "u1", persona: "A patient chemistry teacher.", voiceId: "v1", language: "en", imageKey: "avatars/u1/face.jpg", quality: "standard", title: "Chemistry" };

function fakeDb(turns: TurnRow[], c: ConversationRow | null = conv) {
  const rows = [...turns];
  const voiceovers = new Map<string, { status: string; errorMessage: string | null; data: Record<string, unknown> }>();
  const videos = new Map<string, { status: string; errorMessage: string | null; data: Record<string, unknown> }>();
  let n = 0;
  const match = (r: TurnRow, w: Record<string, unknown>) => Object.entries(w).every(([k, v]) => {
    if (k === "text" && v && typeof v === "object") return (r as never as Record<string, unknown>)[k] !== null;
    if (k === "status" && v && typeof v === "object") return r.status !== (v as { not: string }).not;
    return (r as never as Record<string, unknown>)[k] === v;
  });
  const db: TalkDb = {
    avatarTurn: {
      findMany: async (a) => rows.filter((r) => match(r, (a as { where: Record<string, unknown> }).where)),
      updateMany: async ({ where, data }) => {
        const hit = rows.filter((r) => match(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      create: async ({ data }) => {
        const id = `t${++n}`;
        rows.push({ id, conversationId: data.conversationId as string, userId: data.userId as string, role: data.role as string, text: (data.text as string) ?? null, audioKey: null, status: data.status as string, voiceoverId: (data.voiceoverId as string) ?? null, avatarVideoId: null });
        return { id };
      },
    },
    avatarConversation: { findUnique: async () => c },
    voiceover: {
      create: async ({ data }) => { const id = `vo${++n}`; voiceovers.set(id, { status: "PENDING", errorMessage: null, data }); return { id }; },
      findUnique: async (a) => voiceovers.get((a as { where: { id: string } }).where.id) ?? null,
    },
    avatarVideo: {
      create: async ({ data }) => { const id = `av${++n}`; videos.set(id, { status: "PENDING", errorMessage: null, data }); return { id }; },
      findUnique: async (a) => videos.get((a as { where: { id: string } }).where.id) ?? null,
    },
  };
  return { db, rows, voiceovers, videos };
}

const line = (over: Partial<TurnRow>): TurnRow => ({ id: "t0", conversationId: "c1", userId: "u1", role: "user", text: null, audioKey: null, status: "pending", voiceoverId: null, avatarVideoId: null, ...over });

describe("talking with an avatar (W26; Part 3 §111, §117)", () => {
  it("a recorded line is heard, answered in the persona, voiced, animated and finished", async () => {
    const { db, rows, voiceovers, videos } = fakeDb([line({ audioKey: "talk/u1/q.webm" })]);
    const heard: string[] = [];
    const asked: unknown[] = [];
    const deps = {
      transcribe: async (k: string) => { heard.push(k); return "Why is the sky blue?"; },
      reply: async (persona: string, _l: string, lines: unknown[]) => { asked.push({ persona, lines }); return "Because sunlight scatters off the air itself."; },
    };
    expect(await advanceAvatarTalk(db, deps)).toMatchObject({ answered: 1 });
    expect(heard).toEqual(["talk/u1/q.webm"]);
    expect(asked).toEqual([{ persona: "A patient chemistry teacher.", lines: [{ role: "user", text: "Why is the sky blue?" }] }]);
    expect(rows[0]).toMatchObject({ text: "Why is the sky blue?", status: "ready" });
    const reply = rows.find((r) => r.role === "avatar")!;
    expect(reply).toMatchObject({ status: "speaking", text: "Because sunlight scatters off the air itself." });
    // The reply is a Voice Studio reading in the avatar's voice.
    expect([...voiceovers.values()][0]!.data).toMatchObject({ userId: "u1", voiceId: "v1", language: "en", text: "Because sunlight scatters off the air itself." });

    voiceovers.get(reply.voiceoverId!)!.status = "READY";
    expect(await advanceAvatarTalk(db, deps)).toMatchObject({ voiced: 1 });
    expect(reply.status).toBe("animating");
    expect([...videos.values()][0]!.data).toMatchObject({ imageKey: "avatars/u1/face.jpg", voiceoverId: reply.voiceoverId, quality: "standard" });

    videos.get(reply.avatarVideoId!)!.status = "READY";
    expect(await advanceAvatarTalk(db, deps)).toMatchObject({ finished: 1 });
    expect(reply.status).toBe("ready");
  });

  it("the conversation so far goes with each line; without a portrait the avatar only speaks", async () => {
    const { db, rows, voiceovers } = fakeDb([
      line({ id: "a", text: "Hello", status: "ready" }),
      line({ id: "b", role: "avatar", text: "Hello! What shall we learn?", status: "ready" }),
      line({ id: "c", text: "Acids, please." }),
    ], { ...conv, imageKey: null });
    let seen: unknown = null;
    await advanceAvatarTalk(db, { transcribe: async () => "", reply: async (_p, _l, lines) => { seen = lines; return "Acids taste sour."; } });
    expect(seen).toEqual([{ role: "user", text: "Hello" }, { role: "avatar", text: "Hello! What shall we learn?" }, { role: "user", text: "Acids, please." }]);
    const reply = rows.find((r) => r.text === "Acids taste sour.")!;
    voiceovers.get(reply.voiceoverId!)!.status = "READY";
    await advanceAvatarTalk(db, { transcribe: async () => "", reply: async () => "" });
    expect(reply.status).toBe("ready");
  });

  it("a failure stops that line with its reason; the conversation goes on", async () => {
    const silent = fakeDb([line({ audioKey: "talk/u1/q.webm" })]);
    expect(await advanceAvatarTalk(silent.db, { transcribe: async () => "  ", reply: async () => "x" })).toMatchObject({ failed: 1 });
    expect(silent.rows[0]).toMatchObject({ status: "failed", error: "nothing could be heard in the recording" });
    const { db, rows, voiceovers } = fakeDb([line({ text: "Hi" })]);
    await advanceAvatarTalk(db, { transcribe: async () => "", reply: async () => "Hello there." });
    const reply = rows.find((r) => r.role === "avatar")!;
    Object.assign(voiceovers.get(reply.voiceoverId!)!, { status: "FAILED", errorMessage: "voice licence revoked" });
    await advanceAvatarTalk(db, { transcribe: async () => "", reply: async () => "" });
    expect(reply).toMatchObject({ status: "failed", error: "voice licence revoked" });
  });
});

describe("speech recognition (W26)", () => {
  it("uploads the stored recording and reads the text, however the model wraps it", async () => {
    const calls: unknown[] = [];
    const t = await transcribe("talk/u1/q.webm", "en-GB", {
      getBytes: async () => new Uint8Array([1, 2]),
      upload: async (_k, _b, type, name) => { calls.push({ type, name }); return "https://fal.media/q.webm"; },
      run: async (model, input) => { calls.push({ model, input }); return { chunks: [], text: " Why is the sky blue? " }; },
    }, {});
    expect(t).toBe("Why is the sky blue?");
    expect(calls).toEqual([{ type: "audio/webm", name: "line.webm" }, { model: "fal-ai/whisper", input: { audio_url: "https://fal.media/q.webm", task: "transcribe", language: "en" } }]);
    expect(findText({ output: { text: "nested" } })).toBe("nested");
  });
});
