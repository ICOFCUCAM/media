import { describe, expect, it } from "vitest";
import { eraseDeletedVoices, erasurePlan, type EraseDb, type ErasureRow } from "./erase";

const U = "11111111-1111-1111-1111-111111111111";
const row = (over: Partial<ErasureRow> = {}): ErasureRow => ({
  id: "e1", voiceId: "v1", userId: U, sampleKey: `voices/${U}/a.mp3`, provider: "fal", providerVoiceId: "old-id",
  artifacts: [
    { engine: "fal-minimax", type: "provider_voice_id", uri: "clone-1" },
    { engine: "x", type: "reference_audio", uri: `voices/${U}/ref.wav` },
    { engine: "x", type: "reference_audio", uri: "voices/someone-else/ref.wav" },
    { engine: "x", type: "speaker_embedding", uri: "https://elsewhere/e.bin" },
  ],
  status: "pending", error: null, ...over,
});

function fakeDb(rows: ErasureRow[]) {
  const state = new Map(rows.map((r) => [r.id, { ...r } as ErasureRow & Record<string, unknown>]));
  const db: EraseDb = {
    voiceErasure: {
      findMany: async () => [...state.values()].filter((r) => r.status === "pending"),
      updateMany: async ({ where, data }) => {
        const r = state.get(where.id as string);
        if (!r || r.status !== where.status) return { count: 0 };
        Object.assign(r, data); return { count: 1 };
      },
    },
  };
  return { db, state };
}

describe("erasing a deleted voice (W27)", () => {
  it("plans only the owner's own stored files, and every provider clone", () => {
    const p = erasurePlan(row());
    expect(p.keys).toEqual([`voices/${U}/a.mp3`, `voices/${U}/ref.wav`]);
    expect(p.clones).toEqual([{ engine: "fal-minimax", id: "clone-1" }, { engine: "fal", id: "old-id" }]);
    expect(erasurePlan(row({ sampleKey: "projects/p/x.mp3", artifacts: "nope", providerVoiceId: null }))).toEqual({ keys: [], clones: [] });
  });

  it("deletes the files, asks the providers, records what happened", async () => {
    const { db, state } = fakeDb([row()]);
    const deleted: string[][] = [];
    const out = await eraseDeletedVoices(db, {
      deleteKeys: async (k) => { deleted.push(k); },
      deleteProviderVoice: async (engine) => (engine === "fal-minimax" ? "deleted" : "not_supported"),
    });
    expect(out).toEqual({ done: 1, failed: 0 });
    expect(deleted).toEqual([[`voices/${U}/a.mp3`, `voices/${U}/ref.wav`]]);
    expect(state.get("e1")).toMatchObject({ status: "done", providerOutcome: "not_supported", filesDeleted: deleted[0], error: expect.stringContaining("fal offers no way") });
  });

  it("a voice with nothing at a provider records none", async () => {
    const { db, state } = fakeDb([row({ artifacts: [], providerVoiceId: null })]);
    await eraseDeletedVoices(db, { deleteKeys: async () => {}, deleteProviderVoice: async () => "deleted" });
    expect(state.get("e1")).toMatchObject({ status: "done", providerOutcome: "none", error: null });
  });

  it("a storage failure is retried, then recorded as failed", async () => {
    const { db, state } = fakeDb([row()]);
    const deps = { deleteKeys: async () => { throw new Error("storage down"); }, deleteProviderVoice: async () => "deleted" as const };
    await eraseDeletedVoices(db, deps);
    expect(state.get("e1")).toMatchObject({ status: "pending", error: "[try 1] storage down" });
    await eraseDeletedVoices(db, deps);
    await eraseDeletedVoices(db, deps);
    expect(state.get("e1")).toMatchObject({ status: "failed", error: "[try 3] storage down" });
  });

  it("a provider that fails is recorded, the files are still deleted", async () => {
    const { db, state } = fakeDb([row({ providerVoiceId: null })]);
    await eraseDeletedVoices(db, { deleteKeys: async () => {}, deleteProviderVoice: async () => { throw new Error("401"); } });
    expect(state.get("e1")).toMatchObject({ status: "done", providerOutcome: "failed", error: "fal-minimax: 401" });
  });
});

describe("self-hosted artifacts (docs/74)", () => {
  it("the engine holding a stored artifact is asked to release it; a failure is noted, never fatal", async () => {
    const r = row({ artifacts: [
      { engine: "qwen3-tts", type: "speaker_embedding", uri: `voices/${U}/v1/engines/qwen3-tts/g1.safetensors` },
      { engine: "gpt-sovits", type: "prompt_audio", uri: `voices/${U}/v1/engines/gpt-sovits/g2.wav` },
      { engine: "qwen3-tts", type: "speaker_embedding", uri: "voices/someone-else/x.safetensors" },
    ], providerVoiceId: null });
    const { db, state } = fakeDb([r]);
    const released: string[] = [];
    const deleted: string[][] = [];
    const out = await eraseDeletedVoices(db, {
      deleteKeys: async (k) => { deleted.push(k); },
      deleteProviderVoice: async () => "deleted",
      releaseArtifact: async (engine, a) => {
        if (engine === "gpt-sovits") throw new Error("pod asleep");
        released.push(a.uri);
      },
    });
    expect(out).toEqual({ done: 1, failed: 0 });
    expect(deleted[0]).toEqual(expect.arrayContaining([`voices/${U}/v1/engines/qwen3-tts/g1.safetensors`, `voices/${U}/v1/engines/gpt-sovits/g2.wav`]));
    expect(released).toEqual([`voices/${U}/v1/engines/qwen3-tts/g1.safetensors`]);
    expect(state.get("e1")).toMatchObject({ status: "done", error: expect.stringMatching(/gpt-sovits could not release prompt_audio: pod asleep/) });
  });
});
