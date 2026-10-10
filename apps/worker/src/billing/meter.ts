/**
 * Metering (DirectorOS W11): every paid call is recorded in usage_records —
 * not only video GPU time. LLM tokens, TTS characters, images, music seconds
 * and moderation requests each get a row with what was used (unit, units,
 * provider, model), what it cost and what it was charged.
 *
 *   METER_RATES="llm.input=0:0.000003;llm.output=0:0.000015;tts=0.5:0.000015;image=900:0.04;music=40:0.002;moderation=0:0"
 *
 * Each entry is <kind or kind.part>=<credit-ms per unit>:<USD per unit>. No
 * built-in prices: prices change and are the owner's to set. With no rate a
 * call is still recorded (units, provider, model) at 0 credits and $0 — never
 * silently dropped. A charge is debited with the same atomic increments the
 * video path uses (usage row + users.credits_ms + projects.spent_ms in one
 * transaction). Metering never fails the production: a write that cannot be
 * made is logged as `usage.unrecorded`.
 */
import type { SpeechSynthesisRequest, SpeechSynthesisResult, VoiceEngine } from "@cineforge/voice-contracts";
import { metrics } from "@cineforge/shared";
import { isMissingTable } from "../timeline/store";

/** "video" here is hosted video work billed per call (4K upscale, avatars); GPU clips are metered by the video processor. */
export type MeterKind = "llm" | "tts" | "image" | "music" | "moderation" | "video";
export type MeterUnit = "tokens" | "characters" | "images" | "audio_seconds" | "requests";

export interface UsageEvent {
  kind: MeterKind;
  provider: string;
  model: string | null;
  unit: MeterUnit;
  units: number;
  projectId?: string | null;
  /** The account billed; resolved from the project when absent. */
  userId?: string | null;
  /** LLM: priced separately when llm.input / llm.output rates exist. */
  inputTokens?: number;
  outputTokens?: number;
  meta?: Record<string, unknown>;
}

export interface Rate {
  creditMsPerUnit: number;
  usdPerUnit: number;
}

type Env = Record<string, string | undefined>;
const KEY = /^(llm|tts|image|music|moderation|video)(\.(input|output))?$/;

export function parseMeterRates(spec: string | undefined): Record<string, Rate> {
  const out: Record<string, Rate> = {};
  for (const part of (spec ?? "").split(";").map((s) => s.trim()).filter(Boolean)) {
    const [key, val] = part.split("=").map((s) => s?.trim());
    const [c, u] = (val ?? "").split(":").map(Number);
    if (!key || !KEY.test(key) || !Number.isFinite(c) || !Number.isFinite(u) || c! < 0 || u! < 0) {
      throw new Error(`METER_RATES: "${part}" must be <kind>[.input|.output]=<creditMs>:<usd> with kind llm|tts|image|music|moderation|video`);
    }
    out[key] = { creditMsPerUnit: c!, usdPerUnit: u! };
  }
  return out;
}

/** What a usage event is charged: credits (whole ms, rounded up) and USD. */
export function priceUsage(e: UsageEvent, rates: Record<string, Rate>): { creditMs: number; costUsd: number } {
  let credit = 0;
  let usd = 0;
  const add = (r: Rate | undefined, n: number) => {
    if (!r) return;
    credit += r.creditMsPerUnit * n;
    usd += r.usdPerUnit * n;
  };
  if (e.kind === "llm" && (rates["llm.input"] || rates["llm.output"]) && (e.inputTokens !== undefined || e.outputTokens !== undefined)) {
    add(rates["llm.input"], e.inputTokens ?? 0);
    add(rates["llm.output"], e.outputTokens ?? 0);
  } else {
    add(rates[e.kind], e.units);
  }
  return { creditMs: Math.ceil(credit), costUsd: +usd.toFixed(6) };
}

export interface MeterDb {
  project: { findUnique(a: { where: { id: string }; select: { userId: true } }): Promise<{ userId: string } | null> };
  usageRecord: { create(a: { data: Record<string, unknown> }): unknown };
  user: { update(a: { where: { id: string }; data: Record<string, unknown> }): unknown };
  $transaction(ops: unknown[]): Promise<unknown>;
}

let rates: Record<string, Rate> | null = null;
function currentRates(env: Env): Record<string, Rate> {
  rates ??= parseMeterRates(env.METER_RATES);
  return rates;
}
/** Test hook. */
export function _resetRates(): void {
  rates = null;
}

export type MeterOutcome = "charged" | "recorded" | "unattributed" | "unrecorded";

export async function recordUsage(db: MeterDb, e: UsageEvent, env: Env = process.env): Promise<MeterOutcome> {
  const labels = { kind: e.kind, provider: e.provider, unit: e.unit };
  metrics.inc("cineforge_usage_units_total", "Metered units of paid work, by kind, provider and unit", labels, Math.max(0, e.units));
  try {
    const price = priceUsage(e, currentRates(env));
    const userId = e.userId ?? (e.projectId ? (await db.project.findUnique({ where: { id: e.projectId }, select: { userId: true } }))?.userId : null);
    if (!userId) {
      console.warn(JSON.stringify({ event: "usage.unattributed", ...e, ...price }));
      return "unattributed";
    }
    const row = {
      userId, projectId: e.projectId ?? null, kind: e.kind, provider: e.provider, model: e.model, unit: e.unit,
      units: e.units, creditMs: BigInt(price.creditMs), costUsd: price.costUsd,
      meta: { ...(e.meta ?? {}), ...(e.inputTokens !== undefined ? { inputTokens: e.inputTokens, outputTokens: e.outputTokens } : {}) },
    };
    if (price.creditMs > 0) {
      await db.$transaction([
        db.usageRecord.create({ data: row }),
        db.user.update({ where: { id: userId }, data: { creditsMs: { decrement: price.creditMs } } }),
        ...(e.projectId ? [(db as unknown as { project: { update(a: unknown): unknown } }).project.update({ where: { id: e.projectId }, data: { spentMs: { increment: price.creditMs } } })] : []),
      ]);
      metrics.inc("cineforge_usage_credit_ms_total", "Credits (ms) charged for metered work, by kind", { kind: e.kind }, price.creditMs);
      return "charged";
    }
    await db.usageRecord.create({ data: row });
    return "recorded";
  } catch (err) {
    console.error(JSON.stringify({
      event: "usage.unrecorded", kind: e.kind, provider: e.provider, units: e.units, projectId: e.projectId ?? null,
      error: isMissingTable(err) ? "usage_records not migrated (0044)" : err instanceof Error ? err.message : String(err),
    }));
    return "unrecorded";
  }
}

export interface MeterContext {
  projectId?: string | null;
  userId?: string | null;
}

/** A voice engine whose every successful synthesis is metered (characters spoken). */
export function meteredEngine(engine: VoiceEngine, ctx: MeterContext, record: (e: UsageEvent) => Promise<unknown>): VoiceEngine {
  return new Proxy(engine, {
    get(target, prop, receiver) {
      if (prop !== "synthesize") return Reflect.get(target, prop, receiver);
      return async (req: SpeechSynthesisRequest): Promise<SpeechSynthesisResult> => {
        const res = await target.synthesize(req);
        await record({ kind: "tts", provider: target.id, model: target.version, unit: "characters", units: req.text.length, ...ctx, meta: { language: req.language, cloned: Boolean(req.voice) } });
        return res;
      };
    },
  });
}

/** An image provider whose every generated still is metered (under the provider's own model). */
export function meteredImages<P extends { id: string; model?: string | null; generate(prompt: string, key: string, size: { width: number; height: number }, opts?: { seed?: number; referenceUrls?: string[] }): Promise<unknown> }>(
  provider: P,
  ctx: MeterContext & { purpose: string },
  record: (e: UsageEvent) => Promise<unknown>,
  env: Env = process.env,
): P {
  return new Proxy(provider, {
    get(target, prop, receiver) {
      if (prop !== "generate") return Reflect.get(target, prop, receiver);
      return async (prompt: string, key: string, size: { width: number; height: number }, opts?: { seed?: number; referenceUrls?: string[] }) => {
        const out = await target.generate(prompt, key, size, opts);
        // The model that drew it (a reference-conditioned still uses another, W24).
        const used = (out as { model?: string | null } | null)?.model;
        await record({
          kind: "image", provider: target.id, model: used ?? target.model ?? env.OPENAI_IMAGE_MODEL ?? null, unit: "images", units: 1,
          projectId: ctx.projectId, userId: ctx.userId, meta: { purpose: ctx.purpose, width: size.width, height: size.height },
        });
        return out;
      };
    },
  });
}
