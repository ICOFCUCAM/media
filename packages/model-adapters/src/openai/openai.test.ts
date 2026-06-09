import { describe, it, expect, vi } from "vitest";
import { OpenAIImageAdapter, OpenAITtsAdapter } from "./openai";

function resp(body: unknown, opts: { ok?: boolean; bytes?: boolean } = {}): Response {
  return {
    ok: opts.ok ?? true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  } as Response;
}

describe("OpenAIImageAdapter (GPT-image-1)", () => {
  it("requests a landscape size and uploads the decoded bytes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(resp({ data: [{ b64_json: btoa("PNGDATA") }] }));
    const upload = vi.fn().mockResolvedValue("projects/p/seeds/0.png");
    const a = new OpenAIImageAdapter({ apiKey: "sk", upload, fetchImpl });

    const res = await a.generate({ prompt: "a throne room", width: 1280, height: 720 });

    expect(res.imageKey).toBe("projects/p/seeds/0.png");
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-image-1");
    expect(body.size).toBe("1536x1024"); // landscape
    expect(upload).toHaveBeenCalledOnce();
  });

  it("falls back to a data URL when no upload hook is given", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(resp({ data: [{ b64_json: btoa("x") }] }));
    const a = new OpenAIImageAdapter({ apiKey: "sk", fetchImpl });
    const res = await a.generate({ prompt: "square" });
    expect(res.imageKey.startsWith("data:image/png;base64,")).toBe(true);
  });
});

describe("OpenAITtsAdapter (tts-1, onyx)", () => {
  it("synthesizes onyx narration and uploads the mp3", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(resp(null, { bytes: true }));
    const upload = vi.fn().mockResolvedValue("narration/1.mp3");
    const a = new OpenAITtsAdapter({ apiKey: "sk", upload, fetchImpl });

    const res = await a.synthesize({ text: "Once upon a time" });

    expect(res.audioKey).toBe("narration/1.mp3");
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.model).toBe("tts-1");
    expect(body.voice).toBe("onyx");
    expect(upload).toHaveBeenCalledWith(expect.any(Uint8Array), "audio/mpeg");
  });
});
