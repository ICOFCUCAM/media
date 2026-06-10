/**
 * Social publishing adapters (docs/31). Push a finished film/ad to a social
 * platform behind one interface, the same "drop a key in" shape as the other
 * adapters. Each provider is constructed from env; `configured` reflects whether
 * its OAuth credentials are present. Nothing is posted unless configured.
 *
 * SAFETY: publishing is outward-facing. Every adapter only acts when its
 * credentials are present, and YouTube uploads default to PRIVATE so the
 * creator reviews before the world sees it.
 *
 * Implemented (real HTTP): YouTube (OAuth refresh + resumable upload),
 * TikTok (Content Posting PULL_FROM_URL), Instagram Reels (Graph API
 * container -> publish), Facebook Pages (file_url upload). X/Twitter remains
 * a scaffold (paid API tier).
 */
export interface PublishInput {
  title: string;
  description?: string;
  tags?: string[];
  /** Public (or signed) URL of the finished MP4. */
  videoUrl: string;
}

export type PublishStatus = "published" | "skipped" | "error";

export interface PublishResult {
  provider: string;
  status: PublishStatus;
  id?: string;
  url?: string;
  detail?: string;
}

export interface Publisher {
  readonly provider: string;
  /** True when this provider has all the credentials it needs to post. */
  readonly configured: boolean;
  publish(input: PublishInput): Promise<PublishResult>;
}

abstract class BasePublisher implements Publisher {
  abstract readonly provider: string;
  abstract get configured(): boolean;

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!this.configured) return { provider: this.provider, status: "skipped", detail: "not configured" };
    if (!input.videoUrl) return { provider: this.provider, status: "error", detail: "no video URL" };
    try {
      return await this.upload(input);
    } catch (e) {
      return { provider: this.provider, status: "error", detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
    }
  }

  /** Provider-specific upload. */
  protected abstract upload(input: PublishInput): Promise<PublishResult>;
}

async function jsonOrThrow(res: Response, what: string): Promise<Record<string, unknown>> {
  const body = await res.text();
  if (!res.ok) throw new Error(`${what} ${res.status}: ${body.slice(0, 300)}`);
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(`${what}: non-JSON response`);
  }
}

export class YouTubePublisher extends BasePublisher {
  readonly provider = "youtube";
  constructor(private readonly creds: { clientId?: string; clientSecret?: string; refreshToken?: string }) {
    super();
  }
  get configured(): boolean {
    return Boolean(this.creds.clientId && this.creds.clientSecret && this.creds.refreshToken);
  }
  protected async upload(input: PublishInput): Promise<PublishResult> {
    // OAuth 2.0 refresh grant -> access token.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.creds.clientId!,
        client_secret: this.creds.clientSecret!,
        refresh_token: this.creds.refreshToken!,
        grant_type: "refresh_token",
      }),
    });
    const token = (await jsonOrThrow(tokenRes, "youtube oauth")).access_token as string;

    // Pull the video bytes (signed URL) and resumable-upload them.
    const videoRes = await fetch(input.videoUrl);
    if (!videoRes.ok) throw new Error(`video fetch ${videoRes.status}`);
    const bytes = new Uint8Array(await videoRes.arrayBuffer());

    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          snippet: { title: input.title.slice(0, 100), description: input.description?.slice(0, 4900), tags: input.tags?.slice(0, 30) },
          status: { privacyStatus: "private", selfDeclaredMadeForKids: false }, // safe default; creator promotes
        }),
      },
    );
    if (!initRes.ok) throw new Error(`youtube init ${initRes.status}: ${(await initRes.text()).slice(0, 200)}`);
    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) throw new Error("youtube init returned no upload url");

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": "video/mp4", "content-length": String(bytes.byteLength) },
      body: bytes,
    });
    const out = await jsonOrThrow(putRes, "youtube upload");
    const id = out.id as string;
    return { provider: this.provider, status: "published", id, url: `https://youtu.be/${id}`, detail: "uploaded as PRIVATE — review then publish" };
  }
}

export class TikTokPublisher extends BasePublisher {
  readonly provider = "tiktok";
  constructor(private readonly creds: { accessToken?: string }) {
    super();
  }
  get configured(): boolean {
    return Boolean(this.creds.accessToken);
  }
  protected async upload(input: PublishInput): Promise<PublishResult> {
    // Content Posting API — PULL_FROM_URL into the creator's inbox (draft).
    const res = await fetch("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/", {
      method: "POST",
      headers: { authorization: `Bearer ${this.creds.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ source_info: { source: "PULL_FROM_URL", video_url: input.videoUrl } }),
    });
    const out = await jsonOrThrow(res, "tiktok init");
    const id = (out.data as Record<string, unknown> | undefined)?.publish_id as string | undefined;
    return { provider: this.provider, status: "published", id, detail: "sent to TikTok inbox — open the app to caption & post" };
  }
}

export class InstagramPublisher extends BasePublisher {
  readonly provider = "instagram";
  constructor(private readonly creds: { userId?: string; accessToken?: string }) {
    super();
  }
  get configured(): boolean {
    return Boolean(this.creds.userId && this.creds.accessToken);
  }
  protected async upload(input: PublishInput): Promise<PublishResult> {
    // Graph API Reels: create container -> poll -> publish.
    const base = `https://graph.facebook.com/v21.0/${this.creds.userId}`;
    const caption = [input.description ?? input.title, ...(input.tags ?? []).map((t) => `#${t.replace(/^#/, "")}`)].join(" ").slice(0, 2200);
    const create = await jsonOrThrow(
      await fetch(`${base}/media`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ media_type: "REELS", video_url: input.videoUrl, caption, access_token: this.creds.accessToken! }),
      }),
      "instagram container",
    );
    const containerId = create.id as string;
    // Containers process async; poll briefly.
    for (let i = 0; i < 30; i++) {
      const st = await jsonOrThrow(
        await fetch(`https://graph.facebook.com/v21.0/${containerId}?fields=status_code&access_token=${this.creds.accessToken}`),
        "instagram status",
      );
      if (st.status_code === "FINISHED") break;
      if (st.status_code === "ERROR") throw new Error("instagram container processing failed");
      await new Promise((r) => setTimeout(r, 4000));
    }
    const pub = await jsonOrThrow(
      await fetch(`${base}/media_publish`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ creation_id: containerId, access_token: this.creds.accessToken! }),
      }),
      "instagram publish",
    );
    return { provider: this.provider, status: "published", id: pub.id as string };
  }
}

export class FacebookPublisher extends BasePublisher {
  readonly provider = "facebook";
  constructor(private readonly creds: { pageId?: string; pageToken?: string }) {
    super();
  }
  get configured(): boolean {
    return Boolean(this.creds.pageId && this.creds.pageToken);
  }
  protected async upload(input: PublishInput): Promise<PublishResult> {
    const out = await jsonOrThrow(
      await fetch(`https://graph.facebook.com/v21.0/${this.creds.pageId}/videos`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          file_url: input.videoUrl,
          title: input.title.slice(0, 250),
          description: input.description ?? "",
          access_token: this.creds.pageToken!,
        }),
      }),
      "facebook upload",
    );
    return { provider: this.provider, status: "published", id: out.id as string };
  }
}

export class XPublisher extends BasePublisher {
  readonly provider = "x";
  constructor(private readonly creds: { bearer?: string }) {
    super();
  }
  get configured(): boolean {
    return Boolean(this.creds.bearer);
  }
  protected async upload(input: PublishInput): Promise<PublishResult> {
    // ── Integration point ───────────────────────────────────
    // X media upload requires the paid API tier + chunked INIT/APPEND/FINALIZE.
    void input;
    return { provider: this.provider, status: "error", detail: "X upload requires paid API tier (scaffold)" };
  }
}

export interface PublishEnv {
  YOUTUBE_CLIENT_ID?: string;
  YOUTUBE_CLIENT_SECRET?: string;
  YOUTUBE_REFRESH_TOKEN?: string;
  TIKTOK_ACCESS_TOKEN?: string;
  /** Back-compat: old scaffold read client id/secret. */
  TIKTOK_CLIENT_ID?: string;
  TIKTOK_CLIENT_SECRET?: string;
  IG_USER_ID?: string;
  IG_ACCESS_TOKEN?: string;
  FB_PAGE_ID?: string;
  FB_PAGE_TOKEN?: string;
  X_BEARER_TOKEN?: string;
}

/** Build all known publishers from env. `configured` reflects creds per provider. */
export function buildPublishers(env: PublishEnv): Publisher[] {
  return [
    new YouTubePublisher({ clientId: env.YOUTUBE_CLIENT_ID, clientSecret: env.YOUTUBE_CLIENT_SECRET, refreshToken: env.YOUTUBE_REFRESH_TOKEN }),
    new TikTokPublisher({ accessToken: env.TIKTOK_ACCESS_TOKEN }),
    new InstagramPublisher({ userId: env.IG_USER_ID, accessToken: env.IG_ACCESS_TOKEN }),
    new FacebookPublisher({ pageId: env.FB_PAGE_ID, pageToken: env.FB_PAGE_TOKEN }),
    new XPublisher({ bearer: env.X_BEARER_TOKEN }),
  ];
}
