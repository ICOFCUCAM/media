/**
 * Erasing a deleted voice (W27; migration 0061; Part 3 §110, §118).
 *
 * Deleting a voice row records what it leaves behind (`voice_erasures`). Each
 * poller tick takes the pending erasures and:
 *
 *   - deletes the uploaded recording and every stored engine artifact
 *     (reference audio, embeddings, adapter weights) — only keys under the
 *     owner's own `voices/<user>/` folder, never anything else;
 *   - asks the engine that holds a provider-side clone to delete it, and
 *     records the answer: deleted, not supported by that provider, or failed.
 *
 * The speech the voice spoke into the cache is purged separately
 * (purgeOrphanedSpeech, W14). A failure is recorded and retried on a later
 * tick up to three times; the erasure is never silently dropped.
 */

export interface ErasureRow {
  id: string;
  voiceId: string;
  userId: string;
  sampleKey: string | null;
  provider: string | null;
  providerVoiceId: string | null;
  artifacts: unknown;
  status: string;
  error: string | null;
}

export interface EraseDb {
  voiceErasure: {
    findMany(a: unknown): Promise<ErasureRow[]>;
    updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
}

export type ProviderOutcome = "deleted" | "none" | "not_supported" | "failed";

export interface EraseDeps {
  deleteKeys(keys: string[]): Promise<void>;
  /** Delete a provider-side clone; "not_supported" when the engine has no deletion call. */
  deleteProviderVoice(engine: string, providerVoiceId: string): Promise<"deleted" | "not_supported">;
}

const STORED = new Set(["reference_audio", "prompt_audio", "speaker_embedding", "adapter_weights"]);
const MAX_TRIES = 3;

/** What to delete for one erasure (pure): the owner's stored files and the provider clones. */
export function erasurePlan(r: Pick<ErasureRow, "userId" | "sampleKey" | "provider" | "providerVoiceId" | "artifacts">): { keys: string[]; clones: { engine: string; id: string }[] } {
  const own = `voices/${r.userId}/`;
  const list = Array.isArray(r.artifacts) ? (r.artifacts as { engine?: string; type?: string; uri?: string }[]) : [];
  const keys = new Set<string>();
  if (r.sampleKey?.startsWith(own)) keys.add(r.sampleKey);
  for (const a of list) if (a.type && STORED.has(a.type) && a.uri?.startsWith(own)) keys.add(a.uri);
  const clones = new Map<string, { engine: string; id: string }>();
  for (const a of list) {
    if (a.type === "provider_voice_id" && a.engine && a.uri) clones.set(`${a.engine}:${a.uri}`, { engine: a.engine, id: a.uri });
  }
  // Voices cloned before the Voice Engine kept the provider's id on the row.
  if (r.providerVoiceId && r.provider && ![...clones.values()].some((c) => c.id === r.providerVoiceId)) {
    clones.set(`${r.provider}:${r.providerVoiceId}`, { engine: r.provider, id: r.providerVoiceId });
  }
  return { keys: [...keys], clones: [...clones.values()] };
}

const triesOf = (error: string | null) => Number(/^\[try (\d+)\]/.exec(error ?? "")?.[1] ?? 0);

/** One tick: erase what deleted voices left behind. */
export async function eraseDeletedVoices(db: EraseDb, deps: EraseDeps): Promise<{ done: number; failed: number }> {
  const out = { done: 0, failed: 0 };
  const rows = await db.voiceErasure.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 10 });
  for (const r of rows) {
    if ((await db.voiceErasure.updateMany({ where: { id: r.id, status: "pending" }, data: { status: "erasing" } })).count !== 1) continue;
    const plan = erasurePlan(r);
    try {
      if (plan.keys.length) await deps.deleteKeys(plan.keys);
      let provider: ProviderOutcome = plan.clones.length ? "deleted" : "none";
      const notes: string[] = [];
      for (const c of plan.clones) {
        try {
          if ((await deps.deleteProviderVoice(c.engine, c.id)) === "not_supported") {
            if (provider === "deleted") provider = "not_supported";
            notes.push(`${c.engine} offers no way to delete its clone`);
          }
        } catch (e) {
          provider = "failed";
          notes.push(`${c.engine}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      await db.voiceErasure.updateMany({
        where: { id: r.id, status: "erasing" },
        data: { status: "done", filesDeleted: plan.keys, providerOutcome: provider, error: notes.length ? notes.join("; ").slice(0, 2000) : null, finishedAt: new Date() },
      });
      out.done++;
    } catch (e) {
      const tries = triesOf(r.error) + 1;
      const error = `[try ${tries}] ${e instanceof Error ? e.message : String(e)}`.slice(0, 2000);
      await db.voiceErasure.updateMany({
        where: { id: r.id, status: "erasing" },
        data: tries >= MAX_TRIES ? { status: "failed", error, finishedAt: new Date() } : { status: "pending", error },
      });
      out.failed++;
    }
  }
  return out;
}
