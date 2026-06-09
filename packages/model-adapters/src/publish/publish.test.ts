import { describe, it, expect } from "vitest";
import { buildPublishers, YouTubePublisher, TikTokPublisher } from "./publish";

describe("social publishers", () => {
  it("skips (never posts) when a provider is unconfigured", async () => {
    const yt = new YouTubePublisher({});
    expect(yt.configured).toBe(false);
    const r = await yt.publish({ title: "Ad", videoUrl: "https://cdn/x.mp4" });
    expect(r).toEqual({ provider: "youtube", status: "skipped", detail: "not configured" });
  });

  it("reflects configured state from credentials", () => {
    expect(new YouTubePublisher({ clientId: "a", clientSecret: "b", refreshToken: "c" }).configured).toBe(true);
    expect(new TikTokPublisher({ clientId: "a", clientSecret: "b" }).configured).toBe(true);
    expect(new TikTokPublisher({ clientId: "a" }).configured).toBe(false);
  });

  it("errors (does not silently succeed) when configured but upload isn't wired", async () => {
    const yt = new YouTubePublisher({ clientId: "a", clientSecret: "b", refreshToken: "c" });
    const r = await yt.publish({ title: "Ad", videoUrl: "https://cdn/x.mp4" });
    expect(r.status).toBe("error");
    expect(r.detail).toMatch(/scaffold/);
  });

  it("buildPublishers returns the known providers from env", () => {
    const providers = buildPublishers({ YOUTUBE_CLIENT_ID: "a", YOUTUBE_CLIENT_SECRET: "b", YOUTUBE_REFRESH_TOKEN: "c" });
    expect(providers.map((p) => p.provider)).toEqual(["youtube", "tiktok"]);
    expect(providers.find((p) => p.provider === "youtube")?.configured).toBe(true);
    expect(providers.find((p) => p.provider === "tiktok")?.configured).toBe(false);
  });
});
