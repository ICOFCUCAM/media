/**
 * RunpodControlClient — starts and stops the RunPod GPU itself (the A40 48GB
 * pod / serverless endpoint), as opposed to RunpodClient in
 * packages/model-adapters which sends inference requests to an already-running
 * worker.
 *
 * Supports both RunPod modes:
 *  - Pods (on-demand): resume/stop a specific pod by id.
 *  - Serverless: set endpoint min-workers 0<->1 to start/stop.
 *
 * Endpoints below target RunPod's GraphQL/REST control API; calibrate to the
 * exact API version at integration time.
 */
import { providerUrl } from "@cineforge/shared";
export interface RunpodControlOptions {
  apiKey: string;
  /** Pod id (pods mode) — resume/stop this pod. */
  podId?: string;
  /** Endpoint id (serverless mode) — toggle min workers. */
  endpointId?: string;
  /** Readiness URL of the gpu-worker (`/livez`, public; docs/39). */
  healthUrl: string;
  apiBase?: string; // default RUNPOD_API_URL, else the public API
}

export type GpuPowerState = "RUNNING" | "STARTING" | "STOPPED" | "UNKNOWN";

export class RunpodControlClient {
  private readonly base: string;

  constructor(private readonly opts: RunpodControlOptions) {
    this.base = opts.apiBase ?? providerUrl("runpod");
  }

  private async gql(query: string, variables: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.base}/graphql`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`runpod control ${res.status}: ${await res.text()}`);
    return res.json();
  }

  /** Start the GPU. Idempotent: safe to call when already running/starting. */
  async start(): Promise<void> {
    if (this.opts.podId) {
      await this.gql(
        `mutation($id: String!){ podResume(input:{podId:$id, gpuCount:1}){ id } }`,
        { id: this.opts.podId },
      );
    } else if (this.opts.endpointId) {
      await this.gql(
        `mutation($id: String!){ updateEndpointWorkerCount(input:{endpointId:$id, minWorkers:1}){ id } }`,
        { id: this.opts.endpointId },
      );
    } else {
      throw new Error("RunpodControlClient: set podId or endpointId");
    }
  }

  /** Stop the GPU. Idempotent. This is what stops the cost meter. */
  async stop(): Promise<void> {
    if (this.opts.podId) {
      await this.gql(`mutation($id: String!){ podStop(input:{podId:$id}){ id } }`, {
        id: this.opts.podId,
      });
    } else if (this.opts.endpointId) {
      await this.gql(
        `mutation($id: String!){ updateEndpointWorkerCount(input:{endpointId:$id, minWorkers:0}){ id } }`,
        { id: this.opts.endpointId },
      );
    }
  }

  /**
   * Is the gpu-worker actually serving (model loaded)? Used after start().
   * Probes the public `/livez` route: the worker loads the model before it
   * accepts connections, so a plain `ok` means ready. `/health` needs a
   * gateway token (docs/39); its JSON is still accepted for older workers.
   */
  async isHealthy(): Promise<boolean> {
    try {
      let res = await fetch(this.opts.healthUrl, { signal: AbortSignal.timeout(5000) });
      // A worker image older than the gateway has no /livez; fall back to /health.
      if (res.status === 404 && this.opts.healthUrl.endsWith("/livez")) {
        res = await fetch(this.opts.healthUrl.replace(/\/livez$/, "/health"), { signal: AbortSignal.timeout(5000) });
      }
      if (!res.ok) return false;
      const text = (await res.text()).trim();
      if (text === "ok") return true;
      const body = JSON.parse(text) as { status?: string; modelLoaded?: boolean };
      return (body.status === "ok" || body.status === "healthy") && body.modelLoaded !== false;
    } catch {
      return false;
    }
  }

  /** Poll until the worker is healthy or we time out. */
  async waitUntilHealthy(timeoutMs = 180_000, intervalMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isHealthy()) return;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error("GPU did not become healthy within timeout");
  }
}
