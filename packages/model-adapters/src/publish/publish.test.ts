import { describe, it, expect } from "vitest";
import { buildPublishers, YouTubePublisher, TikTokPublisher, InstagramPublisher, FacebookPublisher, XPublisher } from "./publish";

describe("social publishers", () => {
  it("skips (never posts) when a provider is unconfigured", async () => {
    const yt = new YouTubePublisher({});
    expect(yt.configured).toBe(false);
    const r = await yt.publish({ title: "Ad", videoUrl: "https://cdn/x.mp4" });
    expect(r).toEqual({ provider: "youtube", status: "skipped", detail: "not configured" });
  });

  it("reflects configured state from credentials", () => {
    expect(new YouTubePublisher({ clientId: "a", clientSecret: "b", refreshToken: "c" }).configured).toBe(true);
    expect(new YouTubePublisher({ clientId: "a" }).configured).toBe(false);
    expect(new TikTokPublisher({ accessToken: "t" }).configured).toBe(true);
    expect(new TikTokPublisher({}).configured).toBe(false);
    expect(new InstagramPublisher({ userId: "1", accessToken: "t" }).configured).toBe(true);
    expect(new InstagramPublisher({ userId: "1" }).configured).toBe(false);
    expect(new FacebookPublisher({ pageId: "1", pageToken: "t" }).configured).toBe(true);
    expect(new XPublisher({ bearer: "b" }).configured).toBe(true);
  });

  it("X stays a scaffold: configured but explicitly errors instead of pretending", async () => {
    const x = new XPublisher({ bearer: "b" });
    const r = await x.publish({ title: "Ad", videoUrl: "https://cdn/x.mp4" });
    expect(r.status).toBe("error");
    expect(r.detail).toMatch(/scaffold|paid/);
  });

  it("buildPublishers returns every known platform from env", () => {
    const providers = buildPublishers({ YOUTUBE_CLIENT_ID: "a", YOUTUBE_CLIENT_SECRET: "b", YOUTUBE_REFRESH_TOKEN: "c" });
    expect(providers.map((p) => p.provider)).toEqual(["youtube", "tiktok", "instagram", "facebook", "x"]);
    expect(providers.find((p) => p.provider === "youtube")?.configured).toBe(true);
    expect(providers.find((p) => p.provider === "tiktok")?.configured).toBe(false);
  });

  it("publish() catches upload failures into an error result (never throws)", async () => {
    const fb = new FacebookPublisher({ pageId: "1", pageToken: "bad" });
    const r = await fb.publish({ title: "Ad", videoUrl: "http://127.0.0.1:1/x.mp4" });
    expect(r.provider).toBe("facebook");
    expect(r.status).toBe("error");
  });
});
