import { describe, expect, it } from "vitest";
import { classifyVideoResult, syncPolicy } from "@cineforge/shared";
import type { ModelCapabilities, ShotRequest, ShotResult, VideoModelAdapter } from "../types";
import { runToCompletion } from "./contract";
import { DiffusersRuntime, bindVideoShot } from "./diffusers";

const CAPS: ModelCapabilities = {
  id: "wan-2.1", displayName: "Wan", version: "wan-2.1@test", class: "primary", maxDurationSec: 5,
  resolutions: [{ width: 832, height: 480 }], supportsReferenceImage: true, supportsReferenceVideo: false,
  supportsLora: true, supportsSeed: true, tiers: ["FREE"],
};

function timing(requestedUs: number, frames: number) {
  const actual = frames * 62_500;
  return { requestedDurationUs: requestedUs, actualDurationUs: actual, timingAccuracy: { deltaUs: actual - requestedUs, ratio: 0 },
    frameRate: { num: 16, den: 1 }, frameCount: frames, requestedFrameRate: { num: 16, den: 1 }, conformApplied: "none" };
}

class FakeAdapter implements VideoModelAdapter {
  readonly id = "wan-2.1";
  calls: ShotRequest[] = [];
  constructor(private readonly behave: (req: ShotRequest, signal?: AbortSignal) => Promise<ShotResult>) {}
  capabilities() { return CAPS; }
  estimateCost() { return 1234; }
  async healthcheck() { return { healthy: true, modelLoaded: true }; }
  generate(req: ShotRequest, signal?: AbortSignal) { this.calls.push(req); return this.behave(req, signal); }
}

const SHOT: ShotRequest = { prompt: "a lighthouse", durationSec: 5, width: 832, height: 480, fps: 16, job: { shotId: "s1", projectId: "p1" } as ShotRequest["job"] };
const result = (frames: number): ShotResult => ({ videoKey: "k.mp4", seed: 1, gpuMs: 10, width: 832, height: 480, durationSec: 5, timing: timing(5_000_000, frames) });

describe("DiffusersRuntime", () => {
  it("executes through the adapter and returns the timing report without judging it", async () => {
    const adapter = new FakeAdapter(async () => result(25)); // the Wan frame cap
    const rt = new DiffusersRuntime(adapter);
    const wf = bindVideoShot(adapter, SHOT);
    const done = await runToCompletion(rt, wf, { pollMs: 1 });
    expect(done.state).toBe("completed");
    if (done.state !== "completed") return;
    expect(adapter.calls[0]!.job).toEqual(SHOT.job);
    // The runtime says "completed"; Cineforge says this is not a success.
    const d = classifyVideoResult({ timing: done.timing, request: { durationUs: 5_000_000n, fps: { num: 16, den: 1 } }, policy: syncPolicy("cinematic") });
    expect(d.outcome).toBe("REQUIRES_REGENERATION");
    expect(d.actualDurationUs).toBe(1_562_500n);
  });

  it("validates timing, limits, capabilities and payload integrity", async () => {
    const adapter = new FakeAdapter(async () => result(80));
    const rt = new DiffusersRuntime(adapter);
    expect((await rt.validate(bindVideoShot(adapter, SHOT))).ok).toBe(true);
    const codes = async (req: ShotRequest) => (await rt.validate(bindVideoShot(adapter, req))).errors.map((e) => e.code);
    expect(await codes({ ...SHOT, durationSec: 7 })).toContain("DURATION_EXCEEDS_MODEL");
    expect(await codes({ ...SHOT, fps: undefined })).toContain("TIMING_MISSING");
    expect(await codes({ ...SHOT, width: 1920 })).toContain("UNSUPPORTED_RESOLUTION");
    expect(await codes({ ...SHOT, referenceVideoKeys: ["v.mp4"] })).toContain("CAPABILITY");
    const wf = bindVideoShot(adapter, SHOT);
    wf.payload = { ...wf.payload, prompt: "something else" };
    expect((await rt.validate(wf)).errors.map((e) => e.code)).toContain("PAYLOAD_TAMPERED");
    const failed = await runToCompletion(rt, bindVideoShot(adapter, { ...SHOT, durationSec: 9 }), { pollMs: 1 });
    expect(failed).toMatchObject({ state: "failed", error: { code: "DURATION_EXCEEDS_MODEL" } });
    expect(adapter.calls).toHaveLength(0);
  });

  it("cancels a running generation and reports failures", async () => {
    const adapter = new FakeAdapter((_req, signal) => new Promise((_res, rej) => signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))));
    const rt = new DiffusersRuntime(adapter);
    const { runId } = await rt.execute(bindVideoShot(adapter, SHOT));
    expect(await rt.getStatus(runId)).toMatchObject({ state: "running" });
    await rt.cancel(runId);
    expect(await rt.getStatus(runId)).toEqual({ state: "cancelled" });
    const boom = new DiffusersRuntime(new FakeAdapter(async () => { throw new Error("gpu-worker /generate 500"); }));
    const s = await runToCompletion(boom, bindVideoShot(adapter, SHOT), { pollMs: 1 });
    expect(s).toMatchObject({ state: "failed", error: { code: "RUNTIME_ERROR", retryable: true } });
    expect(await rt.getStatus("nope")).toMatchObject({ state: "failed", error: { code: "UNKNOWN_RUN" } });
  });

  it("describes capabilities from the worker's identity", async () => {
    const adapter = new FakeAdapter(async () => result(80));
    const rt = new DiffusersRuntime(adapter, {
      describeWorker: async () => ({ manifest: { runtime: "diffusers@0.32.2", models: [{ id: "Wan-AI/Wan2.1-T2V-1.3B-Diffusers", revision: "abc" }] }, image: { sourceCommit: "c".repeat(40), codeSha256: "d".repeat(64) } }),
    });
    const caps = await rt.getCapabilities();
    expect(caps).toMatchObject({ runtime: "diffusers", runtimeVersion: "diffusers@0.32.2", models: ["Wan-AI/Wan2.1-T2V-1.3B-Diffusers@abc"], sourceCommit: "c".repeat(40) });
    expect(caps.timing).toMatchObject({ duration: true, fps: true, maxDurationSec: 5 });
    expect(await rt.estimate(bindVideoShot(adapter, SHOT))).toMatchObject({ gpuMs: 1234 });
  });

  it("refuses requests a worker cap would silently re-time or resize (the Wan frame cap)", async () => {
    const adapter = new FakeAdapter(async () => result(80));
    const rt = new DiffusersRuntime(adapter, { describeWorker: async () => ({ limits: { maxWidth: 832, maxHeight: 480, maxFrames: 25, maxSteps: 20 } }) });
    const v = await rt.validate(bindVideoShot(adapter, SHOT));
    expect(v.errors.map((e) => e.code)).toEqual(["RUNTIME_WOULD_RETIME"]);
    expect(v.errors[0]!.message).toContain("1.563 s");
    expect((await rt.validate(bindVideoShot(adapter, { ...SHOT, durationSec: 1.5 }))).ok).toBe(true);
    expect((await rt.getCapabilities()).limits).toEqual({ maxWidth: 832, maxHeight: 480, maxFrames: 25, maxSteps: 20 });
  });
});
