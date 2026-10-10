import { afterEach, describe, expect, it, vi } from "vitest";
import { RunpodClient } from "./runpod-client";

const INPUT = { prompt: "a tiny chef", durationSec: 5, width: 480, height: 832, fps: 16 };
const OUT = { videoKey: "projects/p/v.mp4", seed: 1, gpuMs: 200_000, width: 480, height: 832, durationSec: 5 };

type Reply = { status: number; body: unknown } | Error;
function fakeFetch(replies: Reply[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = replies.shift();
    if (!r) throw new Error("unexpected call");
    if (r instanceof Error) throw r;
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status });
  }));
  return calls;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("RunpodClient.generate", () => {
  const client = () => new RunpodClient({ baseUrl: "https://pod.example", pollMaxMs: 1 });

  it("asks for async and still accepts an older worker's direct answer", async () => {
    const calls = fakeFetch([{ status: 200, body: OUT }]);
    expect(await client().generate(INPUT)).toEqual(OUT);
    expect((calls[0]!.init!.headers as Record<string, string>)["x-cineforge-async"]).toBe("1");
  });

  it("polls a long shot to completion, riding out proxy errors (524) and network blips", async () => {
    const calls = fakeFetch([
      { status: 202, body: { taskId: "t1" } },
      { status: 200, body: { status: "running" } },
      { status: 524, body: "<html>timeout</html>" },
      new TypeError("fetch failed"),
      { status: 200, body: { status: "done", result: OUT } },
    ]);
    expect(await client().generate(INPUT)).toEqual(OUT);
    expect(calls.slice(1).every((c) => c.url === "https://pod.example/generate/jobs/t1")).toBe(true);
  });

  it("a failed shot reports the worker's status and code, as the direct call did", async () => {
    fakeFetch([
      { status: 202, body: { taskId: "t2" } },
      { status: 200, body: { status: "error", httpStatus: 503, detail: { error: "MODEL_NOT_LOADED" } } },
    ]);
    await expect(client().generate(INPUT)).rejects.toThrow('gpu-worker /generate 503: {"detail":{"error":"MODEL_NOT_LOADED"}}');
  });

  it("a task the worker no longer knows (restart) fails the shot instead of waiting forever", async () => {
    fakeFetch([
      { status: 202, body: { taskId: "t3" } },
      { status: 404, body: { detail: { error: "UNKNOWN_TASK" } } },
    ]);
    await expect(client().generate(INPUT)).rejects.toThrow(/gpu-worker \/generate 404: .*UNKNOWN_TASK/);
  });

  it("gives up at its timeout while the shot is still running", async () => {
    fakeFetch([{ status: 202, body: { taskId: "t4" } }, ...Array.from({ length: 500 }, () => ({ status: 200, body: { status: "running" } }))]);
    await expect(new RunpodClient({ baseUrl: "https://pod.example", pollMaxMs: 5, timeoutMs: 60 }).generate(INPUT)).rejects.toMatchObject({ name: "AbortError" });
  });
});
