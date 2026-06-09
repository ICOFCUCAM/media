import { describe, it, expect, vi } from "vitest";
import { StockClient, buildStockClient } from "./stock-client";

function json(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

describe("StockClient", () => {
  it("normalizes Pexels results (highest-res file, credit, auth header)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({
        videos: [
          {
            image: "preview.jpg",
            duration: 12,
            user: { name: "Jane" },
            video_files: [
              { link: "sd.mp4", width: 640, height: 360 },
              { link: "hd.mp4", width: 1920, height: 1080 },
            ],
          },
        ],
      }),
    );
    const c = new StockClient({ provider: "pexels", apiKey: "k", fetchImpl });
    const out = await c.searchVideos("city skyline", 3);

    expect(out).toEqual([
      { url: "hd.mp4", previewUrl: "preview.jpg", width: 1920, height: 1080, durationSec: 12, credit: "Jane (Pexels)", provider: "pexels" },
    ]);
    expect(fetchImpl.mock.calls[0][0]).toContain("per_page=3");
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe("k");
  });

  it("normalizes Pixabay results", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({ hits: [{ duration: 8, user: "Bob", videos: { large: { url: "big.mp4", width: 1280, height: 720 } } }] }),
    );
    const c = new StockClient({ provider: "pixabay", apiKey: "k", fetchImpl });
    const out = await c.searchVideos("ocean");
    expect(out[0]).toMatchObject({ url: "big.mp4", durationSec: 8, credit: "Bob (Pixabay)", provider: "pixabay" });
  });

  it("buildStockClient prefers Pexels, else Pixabay, else null", () => {
    expect(buildStockClient({})).toBeNull();
    expect(buildStockClient({ PIXABAY_API_KEY: "k" })).not.toBeNull();
    expect(buildStockClient({ PEXELS_API_KEY: "k", PIXABAY_API_KEY: "k" })?.provider).toBe("pexels");
  });
});
