/**
 * Licensed stock-footage client (docs/30). Sources b-roll for ads from LICENSED
 * providers (Pexels / Pixabay) — never scraped/arbitrary internet video, which
 * carries copyright risk. Returns normalized clips a creator can drop in as a
 * reference video (video-to-video) or background plate. "Drop a key in":
 * PEXELS_API_KEY or PIXABAY_API_KEY enables it; unset → no stock source.
 */
export type StockProvider = "pexels" | "pixabay";

export interface StockClientOptions {
  provider: StockProvider;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export interface StockVideo {
  url: string; // direct video file URL (licensed for use per the provider terms)
  previewUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  credit?: string; // attribution — surface this in the UI
  provider: StockProvider;
}

export class StockClient {
  private readonly fetch: typeof fetch;
  constructor(private readonly opts: StockClientOptions) {
    if (!opts.apiKey) throw new Error("StockClient: apiKey required");
    this.fetch = opts.fetchImpl ?? fetch;
  }

  get provider(): StockProvider {
    return this.opts.provider;
  }

  async searchVideos(query: string, perPage = 6): Promise<StockVideo[]> {
    return this.opts.provider === "pexels" ? this.pexels(query, perPage) : this.pixabay(query, perPage);
  }

  private async pexels(query: string, perPage: number): Promise<StockVideo[]> {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}`;
    const res = await this.fetch(url, { headers: { authorization: this.opts.apiKey } });
    if (!res.ok) throw new Error(`pexels ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { videos?: PexelsVideo[] };
    return (data.videos ?? []).flatMap((v) => {
      const file = [...(v.video_files ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
      if (!file?.link) return [];
      return [{
        url: file.link,
        previewUrl: v.image,
        width: file.width,
        height: file.height,
        durationSec: v.duration,
        credit: v.user?.name ? `${v.user.name} (Pexels)` : "Pexels",
        provider: "pexels" as const,
      }];
    });
  }

  private async pixabay(query: string, perPage: number): Promise<StockVideo[]> {
    const url = `https://pixabay.com/api/videos/?key=${this.opts.apiKey}&q=${encodeURIComponent(query)}&per_page=${perPage}`;
    const res = await this.fetch(url);
    if (!res.ok) throw new Error(`pixabay ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { hits?: PixabayHit[] };
    return (data.hits ?? []).flatMap((h) => {
      const file = h.videos?.large ?? h.videos?.medium;
      if (!file?.url) return [];
      return [{
        url: file.url,
        width: file.width,
        height: file.height,
        durationSec: h.duration,
        credit: h.user ? `${h.user} (Pixabay)` : "Pixabay",
        provider: "pixabay" as const,
      }];
    });
  }
}

interface PexelsVideo {
  image?: string;
  duration?: number;
  user?: { name?: string };
  video_files?: { link?: string; width?: number; height?: number }[];
}
interface PixabayHit {
  duration?: number;
  user?: string;
  videos?: { large?: PixabayFile; medium?: PixabayFile };
}
interface PixabayFile {
  url?: string;
  width?: number;
  height?: number;
}

export interface StockEnv {
  PEXELS_API_KEY?: string;
  PIXABAY_API_KEY?: string;
}

/** Build a stock client from env (Pexels preferred), or null when unconfigured. */
export function buildStockClient(env: StockEnv): StockClient | null {
  if (env.PEXELS_API_KEY) return new StockClient({ provider: "pexels", apiKey: env.PEXELS_API_KEY });
  if (env.PIXABAY_API_KEY) return new StockClient({ provider: "pixabay", apiKey: env.PIXABAY_API_KEY });
  return null;
}
