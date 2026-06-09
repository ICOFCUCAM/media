import { describe, it, expect, vi } from "vitest";
import { LoraTrainerClient, buildLoraTrainer } from "./lora-client";

function json(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

describe("LoraTrainerClient", () => {
  it("resolves frame keys to URLs and returns the trained lora key + version", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ status: "succeeded", lora_key: "loras/adisa.safetensors", version: "v1" }));
    const resolveImageUrl = vi.fn(async (k: string) => `https://cdn/${k}`);
    const c = new LoraTrainerClient({ baseUrl: "https://train.x", resolveImageUrl, fetchImpl });

    const out = await c.train({ name: "Adisa", appearance: "regal warrior", imageKeys: ["frames/a.png", "frames/b.png"] });

    expect(out).toEqual({ loraKey: "loras/adisa.safetensors", version: "v1" });
    expect(resolveImageUrl).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.image_urls).toEqual(["https://cdn/frames/a.png", "https://cdn/frames/b.png"]);
    expect(body.caption).toBe("regal warrior");
  });

  it("polls an async job until it succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ id: "job1", status: "queued" }))
      .mockResolvedValueOnce(json({ status: "processing" }))
      .mockResolvedValueOnce(json({ status: "succeeded", lora_url: "loras/x.safetensors" }));
    const c = new LoraTrainerClient({ baseUrl: "https://train.x", pollIntervalMs: 1, fetchImpl });

    const out = await c.train({ name: "X", appearance: "a look", imageKeys: ["k"] });
    expect(out.loraKey).toBe("loras/x.safetensors");
    expect(typeof out.version).toBe("string"); // defaulted timestamp
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("rejects when there are no frames to train on", async () => {
    const c = new LoraTrainerClient({ baseUrl: "https://train.x", fetchImpl: vi.fn() });
    await expect(c.train({ name: "X", appearance: "a", imageKeys: [] })).rejects.toThrow(/no reference frames/i);
  });

  it("buildLoraTrainer returns null when unconfigured", () => {
    expect(buildLoraTrainer({})).toBeNull();
    expect(buildLoraTrainer({ LORA_TRAINER_URL: "https://train.x" })).not.toBeNull();
  });
});
