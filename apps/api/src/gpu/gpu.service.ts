import { Inject, Injectable, Logger } from "@nestjs/common";
import type { GpuManagers } from "@cineforge/gpu";
import { GPU_MANAGERS } from "./gpu.module";

/**
 * Thin API-side wrapper over the per-model GpuLifecycleManagers. Resolves the
 * right pool by modelId and exposes the two operations the API needs.
 */
@Injectable()
export class GpuService {
  private readonly log = new Logger(GpuService.name);

  constructor(@Inject(GPU_MANAGERS) private readonly managers: GpuManagers) {}

  /**
   * Start-on-demand. Call BEFORE enqueuing a generation job so the job only
   * runs against a healthy GPU. Idempotent + lock-guarded inside the manager:
   * concurrent submissions start the GPU once and cancel any pending shutdown.
   */
  async ensureRunning(modelId: string): Promise<void> {
    const mgr = this.managers.byModel.get(modelId);
    if (!mgr) throw new Error(`No GPU pool for modelId "${modelId}"`);
    this.log.log(`ensureRunning(${modelId})`);
    await mgr.ensureRunning();
  }

  /** Status of every pool — for the admin GPU panel. */
  async statusAll() {
    return Promise.all([...this.managers.byModel.values()].map((m) => m.status()));
  }
}
