import { describe, expect, it, vi } from "vitest";

import type { ImageCallAuthorizer, ImageGrantHandle, ImageRunResult } from "../gateway/image-authority";
import { COMFY_WORKFLOWS, ComfyImageClient, fitImageSize } from "./image-client";

const RESULT = {
  imageKey: "projects/p/seeds/s.png", imageBytes: 10, sha256: "a".repeat(64), seed: 3, width: 1344, height: 768, gpuMs: 5,
  workflow: { id: "cineforge.still.t2i", version: 1, sha256: "1".repeat(64) }, graphSha256: "2".repeat(64), runtime: "comfyui@x",
  models: [], execution: { mode: "real" }, realExecution: true,
} as ImageRunResult;

function authorizer() {
  const events: string[] = [];
  const grant: ImageGrantHandle = {
    id: "g_1", outputKey: RESULT.imageKey,
    complete: vi.fn(async (r: ImageRunResult) => { events.push("complete"); return r; }),
    fail: vi.fn(async (code: string) => { events.push(`fail:${code}`); }),
  };
  const a: ImageCallAuthorizer = {
    prepareImage: vi.fn(async () => ({ body: '{"jobId":"g_1"}', headers: { authorization: "Bearer run" }, grant, mode: "enforce" as const,
      workflow: { id: "cineforge.still.t2i", version: 1, sha256: "1".repeat(64), models: [] }, authz: "z" })),
    statusHeaders: vi.fn(async () => ({ authorization: "Bearer status" })),
  };
  return { a, grant, events };
}

describe("ComfyImageClient", () => {
  it("submits async with the signed body, polls with status tokens, and verifies through the grant", async () => {
    const { a, events } = authorizer();
    const calls: [string, RequestInit | undefined][] = [];
    let polls = 0;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.endsWith("/images")) return new Response(JSON.stringify({ taskId: "t1" }), { status: 202 });
      polls++;
      if (polls === 1) return new Response("bad gateway", { status: 524 });
      if (polls === 2) return new Response(JSON.stringify({ status: "running" }));
      return new Response(JSON.stringify({ status: "done", result: RESULT }));
    }) as unknown as typeof fetch;
    const out = await new ComfyImageClient({ baseUrl: "https://pod/", authorizer: a, fetchImpl, pollMaxMs: 5 })
      .generate({ payload: { workflow: COMFY_WORKFLOWS.textToImage, prompt: "x", seed: 3, width: 1344, height: 768 }, outputKey: RESULT.imageKey });
    expect(out.imageKey).toBe(RESULT.imageKey);
    expect(calls[0]![0]).toBe("https://pod/images");
    expect(calls[0]![1]!.headers).toMatchObject({ "x-cineforge-async": "1", authorization: "Bearer run" });
    expect(calls[0]![1]!.body).toBe('{"jobId":"g_1"}');
    expect(calls[1]![0]).toBe("https://pod/images/jobs/t1");
    expect(calls[1]![1]!.headers).toEqual({ authorization: "Bearer status" });
    expect(events).toEqual(["complete"]);
  });

  it("a refusal fails the grant and names the service's code", async () => {
    const { a, events } = authorizer();
    const fetchImpl = (async () => new Response(JSON.stringify({ detail: { error: "MODEL_LOADING" } }), { status: 503 })) as unknown as typeof fetch;
    await expect(new ComfyImageClient({ baseUrl: "https://pod", authorizer: a, fetchImpl })
      .generate({ payload: { workflow: COMFY_WORKFLOWS.textToImage, prompt: "x", seed: 1, width: 512, height: 512 }, outputKey: "k" }))
      .rejects.toMatchObject({ code: "MODEL_LOADING", status: 503 });
    expect(events).toEqual(["fail:HTTP_503"]);
  });

  it("an async error result fails the still", async () => {
    const { a, events } = authorizer();
    const fetchImpl = (async (url: string) => url.endsWith("/images")
      ? new Response(JSON.stringify({ taskId: "t" }), { status: 202 })
      : new Response(JSON.stringify({ status: "error", httpStatus: 409, detail: { error: "LORA_HASH_MISMATCH" } }))) as unknown as typeof fetch;
    await expect(new ComfyImageClient({ baseUrl: "https://pod", authorizer: a, fetchImpl, pollMaxMs: 1 })
      .generate({ payload: { workflow: COMFY_WORKFLOWS.textToImage, prompt: "x", seed: 1, width: 512, height: 512 }, outputKey: "k" }))
      .rejects.toMatchObject({ code: "LORA_HASH_MISMATCH" });
    expect(events).toEqual(["fail:HTTP_409"]);
  });

  it("fits sizes the way the registry validates them (same as registry.fit_size)", () => {
    expect(fitImageSize(1920, 1080)).toEqual({ width: 1920, height: 1072 });
    expect(fitImageSize(1280, 720)).toEqual({ width: 1280, height: 720 });
    const big = fitImageSize(3840, 2160);
    expect(big.width * big.height).toBeLessThanOrEqual(2_100_000);
    expect(big.width % 16 + big.height % 16).toBe(0);
  });
});
