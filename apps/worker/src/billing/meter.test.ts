import { afterEach, describe, expect, it } from "vitest";
import type { VoiceEngine } from "@cineforge/voice-contracts";
import { _resetRates, meteredEngine, meteredImages, parseMeterRates, priceUsage, recordUsage, type MeterDb, type UsageEvent } from "./meter";

afterEach(() => _resetRates());

const llm: UsageEvent = { kind: "llm", provider: "anthropic", model: "m", unit: "tokens", units: 12_000, inputTokens: 10_000, outputTokens: 2_000, projectId: "p1" };

describe("meter rates (owner-set, never built in)", () => {
  it("parses kind and kind.part rates", () => {
    expect(parseMeterRates("llm.input=0.01:0.000003; llm.output=0.05:0.000015;tts=0.5:0.00002")).toEqual({
      "llm.input": { creditMsPerUnit: 0.01, usdPerUnit: 0.000003 },
      "llm.output": { creditMsPerUnit: 0.05, usdPerUnit: 0.000015 },
      tts: { creditMsPerUnit: 0.5, usdPerUnit: 0.00002 },
    });
    expect(parseMeterRates(undefined)).toEqual({});
  });

  it("refuses unknown kinds, malformed and negative rates", () => {
    expect(() => parseMeterRates("gpu=1:1")).toThrow(/METER_RATES/);
    expect(() => parseMeterRates("tts=cheap")).toThrow(/METER_RATES/);
    expect(() => parseMeterRates("tts=-1:0")).toThrow(/METER_RATES/);
  });

  it("prices LLM input and output separately when both rates exist, credits rounded up", () => {
    const r = parseMeterRates("llm.input=0.01:0.000003;llm.output=0.05:0.000015");
    expect(priceUsage(llm, r)).toEqual({ creditMs: 200, costUsd: 0.06 });
    expect(priceUsage({ ...llm, kind: "tts", unit: "characters", units: 3 }, parseMeterRates("tts=0.5:0.00002"))).toEqual({ creditMs: 2, costUsd: 0.00006 });
    expect(priceUsage(llm, {})).toEqual({ creditMs: 0, costUsd: 0 });
  });
});

function fakeDb(owner: string | null = "u1") {
  const ops: { op: string; args: unknown }[] = [];
  const db = {
    project: {
      findUnique: async () => (owner ? { userId: owner } : null),
      update: (a: unknown) => { ops.push({ op: "project.update", args: a }); return a; },
    },
    usageRecord: { create: (a: unknown) => { ops.push({ op: "usage.create", args: a }); return a; } },
    user: { update: (a: unknown) => { ops.push({ op: "user.update", args: a }); return a; } },
    $transaction: async (xs: unknown[]) => { ops.push({ op: "transaction", args: xs.length }); return xs; },
  };
  return { db: db as unknown as MeterDb, ops };
}

describe("recordUsage", () => {
  it("without a rate, records the usage at 0 credits — never drops it", async () => {
    const { db, ops } = fakeDb();
    expect(await recordUsage(db, llm, {})).toBe("recorded");
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: "usage.create", args: { data: { userId: "u1", kind: "llm", units: 12_000, creditMs: 0n, costUsd: 0, meta: { inputTokens: 10_000, outputTokens: 2_000 } } } });
  });

  it("with a rate, charges in one transaction: usage row, balance decrement, project spend", async () => {
    const { db, ops } = fakeDb();
    expect(await recordUsage(db, llm, { METER_RATES: "llm.input=0.01:0.000003;llm.output=0.05:0.000015" })).toBe("charged");
    expect(ops.map((o) => o.op)).toEqual(["usage.create", "user.update", "project.update", "transaction"]);
    expect(ops[1]?.args).toEqual({ where: { id: "u1" }, data: { creditsMs: { decrement: 200 } } });
    expect(ops[2]?.args).toEqual({ where: { id: "p1" }, data: { spentMs: { increment: 200 } } });
    expect(ops[3]?.args).toBe(3);
  });

  it("names unattributed usage instead of guessing a payer", async () => {
    const { db, ops } = fakeDb(null);
    expect(await recordUsage(db, { ...llm, projectId: null }, {})).toBe("unattributed");
    expect(ops).toEqual([]);
  });

  it("a failed write never breaks the production; it is logged as unrecorded", async () => {
    const { db } = fakeDb();
    (db as unknown as { usageRecord: { create: () => never } }).usageRecord.create = () => { throw Object.assign(new Error('relation "usage_records" does not exist'), { code: "P2021" }); };
    expect(await recordUsage(db, llm, {})).toBe("unrecorded");
  });
});

describe("metered engines and providers", () => {
  const engine = {
    id: "openai-tts", version: "tts-1",
    synthesize: async (r: { text: string; outPath: string }) => {
      if (r.text === "fail") throw new Error("provider 500");
      return { path: r.outPath, format: "wav" as const };
    },
    getCapabilities: () => ({}) as never, enrollVoice: async () => ({}) as never, health: async () => ({ ok: true }), unload: async () => {},
  } as unknown as VoiceEngine;

  it("meters the characters of every successful synthesis, nothing on failure", async () => {
    const seen: UsageEvent[] = [];
    const m = meteredEngine(engine, { projectId: "p1" }, async (e) => { seen.push(e); });
    expect(m.id).toBe("openai-tts");
    await m.synthesize({ text: "Hello there.", language: "en", voice: null, outPath: "/x.wav" });
    await expect(m.synthesize({ text: "fail", language: "en", voice: null, outPath: "/y.wav" })).rejects.toThrow(/500/);
    expect(seen).toEqual([expect.objectContaining({ kind: "tts", provider: "openai-tts", model: "tts-1", unit: "characters", units: 12, projectId: "p1" })]);
  });

  it("meters each generated still with its purpose", async () => {
    const seen: UsageEvent[] = [];
    const p = meteredImages({ id: "openai-image", generate: async (_p: string, key: string, _s: { width: number; height: number }) => key }, { projectId: "p1", purpose: "seed_frame" }, async (e) => { seen.push(e); }, {});
    expect(await p.generate("a lighthouse", "k.png", { width: 832, height: 480 })).toBe("k.png");
    expect(seen).toEqual([expect.objectContaining({ kind: "image", units: 1, meta: { purpose: "seed_frame", width: 832, height: 480 } })]);
  });
});
