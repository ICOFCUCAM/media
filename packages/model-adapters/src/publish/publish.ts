/**
 * Social publishing adapters (docs/31). Push a finished film/ad to a social
 * platform behind one interface, the same "drop a key in" shape as the other
 * adapters. Each provider is constructed from env; `configured` reflects whether
 * its OAuth credentials are present. Nothing is posted unless configured.
 *
 * SAFETY: publishing is outward-facing. The real upload (OAuth refresh +
 * platform upload API) is a marked integration point — these adapters do not
 * post until that's wired, and they never act for a provider that lacks creds.
 */
export interface PublishInput {
  title: string;
  description?: string;
  tags?: string[];
  /** Public URL of the finished MP4 (resolved from storage). */
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
    return this.upload(input);
  }

  /** Provider-specific upload. Integration point — see each subclass. */
  protected abstract upload(input: PublishInput): Promise<PublishResult>;
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
    // ── Integration point ───────────────────────────────────
    // const token = await refreshOAuth(this.creds);            // OAuth 2.0 refresh grant
    // const id = await resumableUpload(token, input.videoUrl, {
    //   snippet: { title: input.title, description: input.description, tags: input.tags },
    //   status: { privacyStatus: "private" },                  // default safe; creator promotes
    // });                                                       // YouTube Data API v3 (resumable)
    // return { provider: this.provider, status: "published", id, url: `https://youtu.be/${id}` };
    void input;
    return { provider: this.provider, status: "error", detail: "upload not wired (scaffold)" };
  }
}

export class TikTokPublisher extends BasePublisher {
  readonly provider = "tiktok";
  constructor(private readonly creds: { clientId?: string; clientSecret?: string }) {
    super();
  }
  get configured(): boolean {
    return Boolean(this.creds.clientId && this.creds.clientSecret);
  }
  protected async upload(input: PublishInput): Promise<PublishResult> {
    // ── Integration point ───────────────────────────────────
    // Content Posting API: init upload -> PULL_FROM_URL(input.videoUrl) -> poll publish status.
    void input;
    return { provider: this.provider, status: "error", detail: "upload not wired (scaffold)" };
  }
}

export interface PublishEnv {
  YOUTUBE_CLIENT_ID?: string;
  YOUTUBE_CLIENT_SECRET?: string;
  YOUTUBE_REFRESH_TOKEN?: string;
  TIKTOK_CLIENT_ID?: string;
  TIKTOK_CLIENT_SECRET?: string;
}

/** Build all known publishers from env. `configured` reflects creds per provider. */
export function buildPublishers(env: PublishEnv): Publisher[] {
  return [
    new YouTubePublisher({ clientId: env.YOUTUBE_CLIENT_ID, clientSecret: env.YOUTUBE_CLIENT_SECRET, refreshToken: env.YOUTUBE_REFRESH_TOKEN }),
    new TikTokPublisher({ clientId: env.TIKTOK_CLIENT_ID, clientSecret: env.TIKTOK_CLIENT_SECRET }),
  ];
}
