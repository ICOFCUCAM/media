/**
 * Which image is a deployment actually running? Asked of the provider's
 * control plane, never of the pod itself (a pod can claim anything). RunPod:
 * the pod's configured `imageName`. Enforcement requires it to be exactly the
 * approved immutable reference `repo@sha256:<digest>` (docs/39).
 */
import type { ImageAttestor, RuntimeDeployment } from "@cineforge/model-adapters";

export class RunpodImageAttestor implements ImageAttestor {
  constructor(
    private readonly apiKey: string,
    private readonly apiBase = "https://api.runpod.io",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async runningImage(d: RuntimeDeployment): Promise<string | null> {
    if (!d.runpodPodId) return null;
    const res = await this.fetchImpl(`${this.apiBase}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ query: "query($id:String!){ pod(input:{podId:$id}){ id imageName } }", variables: { id: d.runpodPodId } }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { pod?: { id?: string; imageName?: string } | null } };
    const pod = json.data?.pod;
    return pod?.id === d.runpodPodId ? (pod.imageName ?? null) : null;
  }
}
