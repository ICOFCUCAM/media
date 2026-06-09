/**
 * LoRA trainer — submits a per-character training job to a GPU training endpoint
 * and returns the trained adapter's storage key + version (docs/28). Same
 * "drop a key in" shape as the external video adapter: set LORA_TRAINER_URL
 * (+ LORA_TRAINER_KEY) and the worker's lora-queue starts producing real LoRAs;
 * unset, training is skipped and identity falls back to seed + reference frames.
 */
export interface LoraTrainerOptions {
  baseUrl: string;
  apiKey?: string;
  /** Resolve a private reference-frame key to a URL the trainer can fetch. */
  resolveImageUrl?: (key: string) => Promise<string>;
  timeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: typeof fetch;
}

export interface LoraTrainInput {
  /** Character name + canonical appearance, used as the training caption. */
  name: string;
  appearance: string;
  /** Storage keys of the character's reference frames. */
  imageKeys: string[];
  steps?: number;
}

export interface LoraTrainOutput {
  loraKey: string;
  version: string;
}

interface TrainerResponse {
  id?: string;
  status?: string;
  lora_key?: string;
  lora_url?: string;
  version?: string;
  error?: string;
}

export class LoraTrainerClient {
  private readonly fetch: typeof fetch;
  constructor(private readonly opts: LoraTrainerOptions) {
    if (!opts.baseUrl) throw new Error("LoraTrainerClient: baseUrl required");
    this.fetch = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (this.opts.apiKey) h["authorization"] = `Bearer ${this.opts.apiKey}`;
    return h;
  }

  async train(input: LoraTrainInput, signal?: AbortSignal): Promise<LoraTrainOutput> {
    if (!input.imageKeys.length) throw new Error("LoraTrainerClient: no reference frames to train on");
    const ctrl = new AbortController();
    const timeoutMs = this.opts.timeoutMs ?? 60 * 60_000; // training is slow
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    if (signal) signal.addEventListener("abort", () => ctrl.abort());
    try {
      const resolve = this.opts.resolveImageUrl;
      const imageUrls = resolve ? await Promise.all(input.imageKeys.map((k) => resolve(k))) : input.imageKeys;

      const submit = await this.post(
        `${this.opts.baseUrl}/train`,
        { name: input.name, caption: input.appearance, image_urls: imageUrls, steps: input.steps ?? 1200 },
        ctrl.signal,
      );
      const final = submit.lora_key || submit.lora_url ? submit : await this.poll(submit, ctrl.signal);
      const loraKey = final.lora_key ?? final.lora_url;
      if (!loraKey) throw new Error(`lora trainer returned no lora_key (status ${final.status ?? "unknown"})`);
      return { loraKey, version: final.version ?? new Date().toISOString() };
    } finally {
      clearTimeout(t);
    }
  }

  private async poll(initial: TrainerResponse, signal: AbortSignal): Promise<TrainerResponse> {
    if (!initial.id) return initial;
    const interval = this.opts.pollIntervalMs ?? 10_000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (signal.aborted) throw new Error("lora trainer: timed out");
      const res = await this.get(`${this.opts.baseUrl}/tasks/${initial.id}`, signal);
      if (res.status === "succeeded") return res;
      if (res.status === "failed") throw new Error(`lora trainer failed: ${res.error ?? "unknown error"}`);
      await new Promise((r) => setTimeout(r, interval));
    }
  }

  private async post(url: string, body: unknown, signal: AbortSignal): Promise<TrainerResponse> {
    const res = await this.fetch(url, { method: "POST", headers: this.headers(), body: JSON.stringify(body), signal });
    if (!res.ok) throw new Error(`lora trainer POST ${res.status}: ${await res.text()}`);
    return (await res.json()) as TrainerResponse;
  }

  private async get(url: string, signal: AbortSignal): Promise<TrainerResponse> {
    const res = await this.fetch(url, { headers: this.headers(), signal });
    if (!res.ok) throw new Error(`lora trainer GET ${res.status}: ${await res.text()}`);
    return (await res.json()) as TrainerResponse;
  }
}

export interface LoraTrainerEnv {
  LORA_TRAINER_URL?: string;
  LORA_TRAINER_KEY?: string;
  LORA_TRAINER_STEPS?: string;
}

/** Build the trainer from env, or null when unconfigured (training disabled). */
export function buildLoraTrainer(
  env: LoraTrainerEnv,
  hooks: { resolveImageUrl?: (key: string) => Promise<string> } = {},
): LoraTrainerClient | null {
  if (!env.LORA_TRAINER_URL) return null;
  return new LoraTrainerClient({
    baseUrl: env.LORA_TRAINER_URL,
    apiKey: env.LORA_TRAINER_KEY,
    resolveImageUrl: hooks.resolveImageUrl,
  });
}
