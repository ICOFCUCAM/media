import { afterEach, describe, expect, it, vi } from "vitest";

import { RunpodControlClient } from "./runpod-control";

const client = () => new RunpodControlClient({ apiKey: "k", podId: "p", healthUrl: "https://pod/livez" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RunpodControlClient.isHealthy (docs/39: public /livez probe)", () => {
  it("is ready when /livez answers ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));
    expect(await client().isHealthy()).toBe(true);
  });

  it("falls back to /health for a worker image without /livez", async () => {
    const f = vi.fn(async (url: string) =>
      url.endsWith("/livez") ? new Response("", { status: 404 }) : new Response(JSON.stringify({ status: "ok", modelLoaded: true })));
    vi.stubGlobal("fetch", f);
    expect(await client().isHealthy()).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("is not ready when the worker refuses or is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    expect(await client().isHealthy()).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    expect(await client().isHealthy()).toBe(false);
  });
});
