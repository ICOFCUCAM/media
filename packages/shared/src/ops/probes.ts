/**
 * Liveness and readiness (docs/38 §AF checklist 3). Live = the process
 * answers. Ready = every dependency it needs to do work answers within the
 * timeout — a service that cannot reach its database or queue is not ready
 * and must not receive traffic or jobs.
 */

export interface CheckResult {
  ok: boolean;
  ms: number;
  error?: string;
}

export interface Readiness {
  ok: boolean;
  checks: Record<string, CheckResult>;
}

export async function readiness(checks: Record<string, () => Promise<unknown>>, timeoutMs = 2000): Promise<Readiness> {
  const entries = await Promise.all(Object.entries(checks).map(async ([name, check]) => {
    const t0 = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        check(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs} ms`)), timeoutMs); }),
      ]);
      return [name, { ok: true, ms: Date.now() - t0 }] as const;
    } catch (e) {
      return [name, { ok: false, ms: Date.now() - t0, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }] as const;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }));
  const out = Object.fromEntries(entries) as Record<string, CheckResult>;
  return { ok: Object.values(out).every((c) => c.ok), checks: out };
}
