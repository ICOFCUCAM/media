/**
 * ActiveJobTracker — the reference counter that keeps a GPU alive while ANY
 * user's generation is in flight, regardless of how many users are online.
 *
 * The authoritative source of truth is the BullMQ queue state itself (not a
 * hand-maintained counter that can drift across multiple API/worker nodes):
 *
 *   activeJobs = active                  (currently generating on a GPU)
 *   queuedJobs = waiting + delayed + prioritized + paused
 *   totalActive = activeJobs + queuedJobs
 *
 * Multi-user, multi-node safe: every API and worker process reads the same
 * Redis-backed queue counts, so "the last generation" is correctly observed no
 * matter which node finishes it. See docs/23-gpu-lifecycle-manager.md.
 */
import { Queue } from "bullmq";
import { QUEUES } from "@cineforge/shared";

export interface JobCounts {
  queued: number; // waiting + delayed + prioritized + paused
  running: number; // active (on a GPU right now)
  pending: number; // delayed/prioritized not yet runnable
  total: number; // queued + running
}

export class ActiveJobTracker {
  /** Queues whose work consumes a GPU. Audio (MusicGen/AudioGen) can be GPU
   *  too; include it so the GPU isn't shut down mid-score. */
  private readonly gpuQueues: Queue[];

  constructor(connection: { url: string }) {
    this.gpuQueues = [
      new Queue(QUEUES.video, { connection }),
      new Queue(QUEUES.audio, { connection }),
    ];
  }

  /** Aggregate counts across every GPU-backed queue (= across all users). */
  async counts(): Promise<JobCounts> {
    const per = await Promise.all(
      this.gpuQueues.map((q) =>
        q.getJobCounts("active", "waiting", "delayed", "prioritized", "paused"),
      ),
    );
    const sum = (k: string) => per.reduce((a, c) => a + (c[k] ?? 0), 0);

    const running = sum("active");
    const pending = sum("delayed") + sum("prioritized");
    const queued = sum("waiting") + pending + sum("paused");

    return { running, pending, queued, total: running + queued };
  }

  /** The shutdown predicate's first half: no work anywhere. */
  async isIdle(): Promise<boolean> {
    return (await this.counts()).total === 0;
  }

  async close(): Promise<void> {
    await Promise.all(this.gpuQueues.map((q) => q.close()));
  }
}
