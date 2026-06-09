import { describe, it, expect, vi } from "vitest";
import { ExternalApiAdapter } from "./external.adapter";
import type { ShotRequest } from "../types";

const baseReq: ShotRequest = { prompt: "a city at dusk", durationSec: 5, width: 1280, height: 720 };

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

describe("ExternalApiAdapter", () => {
  it("exposes external capabilities and supports reference images", () => {
    const a = new ExternalApiAdapter({ id: "ext-vid", displayName: "Ext", baseUrl: "https://api.x", fetchImpl: vi.fn() });
    const caps = a.capabilities();
    expect(caps.class).toBe("external");
    expect(caps.supportsReferenceImage).toBe(true);
    expect(caps.supportsReferenceVideo).toBe(true);
    expect(caps.id).toBe("ext-vid");
  });

  it("conditions on a reference video (video-to-video)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: "succeeded", video_url: "https://cdn/out.mp4" }));
    const resolveVideoUrl = vi.fn().mockResolvedValue("https://signed/ref.mp4");
    const a = new ExternalApiAdapter({ id: "ext", displayName: "Ext", baseUrl: "https://api.x", resolveVideoUrl, fetchImpl });

    await a.generate({ ...baseReq, referenceVideoKeys: ["projects/p/refvideo/0.mp4"], videoOp: "style", motionStrength: 0.7 });

    expect(resolveVideoUrl).toHaveBeenCalledWith("projects/p/refvideo/0.mp4");
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.reference_video_url).toBe("https://signed/ref.mp4");
    expect(body.operation).toBe("style");
    expect(body.motion_strength).toBe(0.7);
  });

  it("handles a synchronous provider response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ status: "succeeded", video_url: "https://cdn/clip.mp4", seed: 42 }),
    );
    const a = new ExternalApiAdapter({ id: "ext", displayName: "Ext", baseUrl: "https://api.x", fetchImpl });
    const res = await a.generate(baseReq);
    expect(res.videoKey).toBe("https://cdn/clip.mp4");
    expect(res.seed).toBe(42);
    expect(res.gpuMs).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.x/generate");
  });

  it("polls an asynchronous job until it succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "job-1" }))
      .mockResolvedValueOnce(jsonResponse({ status: "processing" }))
      .mockResolvedValueOnce(jsonResponse({ status: "succeeded", video_url: "https://cdn/done.mp4" }));
    const a = new ExternalApiAdapter({ id: "ext", displayName: "Ext", baseUrl: "https://api.x", pollIntervalMs: 1, fetchImpl });
    const res = await a.generate(baseReq);
    expect(res.videoKey).toBe("https://cdn/done.mp4");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[1][0]).toBe("https://api.x/tasks/job-1");
  });

  it("resolves a seed frame to a URL and mirrors the result to storage", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ status: "succeeded", video_url: "https://cdn/clip.mp4" }));
    const resolveImageUrl = vi.fn().mockResolvedValue("https://signed/seed.png");
    const upload = vi.fn().mockResolvedValue("projects/p1/clips/0.mp4");
    const a = new ExternalApiAdapter({ id: "ext", displayName: "Ext", baseUrl: "https://api.x", resolveImageUrl, upload, fetchImpl });

    const res = await a.generate({ ...baseReq, referenceImageKeys: ["projects/p1/seeds/0.png"] });

    expect(resolveImageUrl).toHaveBeenCalledWith("projects/p1/seeds/0.png");
    const submittedBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(submittedBody.image_url).toBe("https://signed/seed.png");
    expect(upload).toHaveBeenCalledWith("https://cdn/clip.mp4");
    expect(res.videoKey).toBe("projects/p1/clips/0.mp4"); // our storage key, not the vendor URL
  });

  it("throws when the provider job fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: "job-2" }))
      .mockResolvedValueOnce(jsonResponse({ status: "failed", error: "nsfw" }));
    const a = new ExternalApiAdapter({ id: "ext", displayName: "Ext", baseUrl: "https://api.x", pollIntervalMs: 1, fetchImpl });
    await expect(a.generate(baseReq)).rejects.toThrow(/failed: nsfw/);
  });
});
