/**
 * Capability Registry publisher (DirectorOS DOS-77/78; migration 0031).
 *
 * The worker computes what is actually operational from its configuration and
 * the GPU workers' own `/capabilities` reports, and writes it to
 * `system_capabilities` for the web app. GPU reports are cached in Redis when a
 * pod is awake (the publisher never wakes a sleeping GPU), with the time they
 * were verified.
 */
import { buildCapabilityRegistry, type Capability, type CapabilityProbe, type GpuCapabilitiesWire } from "@cineforge/shared";
import { isMissingTable } from "../timeline/store";

export const GPU_CAPS_TTL_SEC = 7 * 24 * 3600;
const key = (modelId: string) => `cf:truth:gpu-caps:${modelId}`;

export interface CapsCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", ttl: number): Promise<unknown>;
}

export interface CachedGpuCaps {
  caps: GpuCapabilitiesWire;
  verifiedAt: string;
}

export async function rememberGpuCaps(cache: CapsCache, modelId: string, caps: Record<string, unknown>, now = new Date()): Promise<void> {
  const wire: GpuCapabilitiesWire = {
    model: typeof caps.model === "string" ? caps.model : modelId,
    execution: typeof caps.execution === "string" ? caps.execution : caps.realExecution === true ? "real" : undefined,
    realExecution: caps.realExecution === true,
    supportsRefImage: caps.supportsRefImage === true,
    supportsRefVideo: caps.supportsRefVideo === true,
    supportsCamera: caps.supportsCamera === true,
    supportsLora: caps.supportsLora === true,
    maxResolution: Array.isArray(caps.maxResolution) ? (caps.maxResolution as [number, number]) : null,
  };
  await cache.set(key(modelId), JSON.stringify({ caps: wire, verifiedAt: now.toISOString() }), "EX", GPU_CAPS_TTL_SEC);
}

export async function readGpuCaps(cache: CapsCache, modelIds: string[]): Promise<Record<string, CachedGpuCaps | null>> {
  const out: Record<string, CachedGpuCaps | null> = {};
  for (const m of modelIds) {
    const raw = await cache.get(key(m));
    out[m] = raw ? (JSON.parse(raw) as CachedGpuCaps) : null;
  }
  return out;
}

export function currentRegistry(
  env: Record<string, string | undefined>,
  gpu: Record<string, CachedGpuCaps | null>,
  intelligence?: CapabilityProbe["intelligence"],
): Capability[] {
  const wire: Record<string, GpuCapabilitiesWire | null> = {};
  for (const [m, c] of Object.entries(gpu)) wire[m] = c?.caps ?? { execution: "not yet verified", realExecution: false };
  const registry = buildCapabilityRegistry({ env, gpu: wire, intelligence });
  // Say when the GPU facts were last verified (pods sleep when idle).
  const wan = gpu["wan-2.1"];
  return registry.map((c) =>
    c.requiresGpu && wan ? { ...c, note: [c.note, `GPU verified ${wan.verifiedAt}`].filter(Boolean).join("; ") } : c,
  );
}

export interface CapabilityRow {
  provider: string | null;
  status: string;
  realExecution: boolean;
  requiresGpu: boolean;
  supports: string[];
  note: string | null;
  reportedBy: string;
  updatedAt: Date;
}

export interface CapabilityDb {
  systemCapability: {
    upsert(args: { where: { capability: string }; create: CapabilityRow & { capability: string }; update: CapabilityRow }): Promise<unknown>;
  };
}

let tableMissing = false;

export async function publishCapabilities(db: CapabilityDb, registry: Capability[], reporter: string): Promise<"published" | "skipped"> {
  if (tableMissing) return "skipped";
  try {
    for (const c of registry) {
      const row: CapabilityRow = {
        provider: c.provider,
        status: c.status,
        realExecution: c.realExecution,
        requiresGpu: c.requiresGpu ?? false,
        supports: c.supports ?? [],
        note: c.note?.slice(0, 300) ?? null,
        reportedBy: reporter,
        updatedAt: new Date(),
      };
      await db.systemCapability.upsert({ where: { capability: c.capability }, create: { capability: c.capability, ...row }, update: row });
    }
    console.log(JSON.stringify({ event: "truth.capabilities", published: registry.length,
      real: registry.filter((c) => c.realExecution).map((c) => c.capability) }));
    return "published";
  } catch (e) {
    if (isMissingTable(e)) {
      tableMissing = true;
      console.warn('{"event":"truth.capabilities","note":"system_capabilities not migrated (0031); not published until restart"}');
      return "skipped";
    }
    console.error(JSON.stringify({ event: "truth.capabilities", error: e instanceof Error ? e.message : String(e) }));
    return "skipped";
  }
}

/** Test hook. */
export function _resetPublisherState(): void {
  tableMissing = false;
}
