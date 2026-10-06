/**
 * One-time, object-scoped storage URLs for GPU workers (docs/38 §O, §P;
 * docs/39 D6). The worker keeps its storage credentials; GPU pods receive only
 * these URLs, each for exactly one object of the job being run.
 *
 *  - S3Presigner (default): presigned GET (inputs, ≤ 15 min) and PUT (outputs,
 *    ≤ 30 min) through the bucket's S3 API — Supabase Storage's S3 endpoint
 *    today, any S3-compatible store later.
 *  - SupabaseSignedUploadPresigner (fallback, GPU_UPLOAD_URL_MODE=supabase):
 *    outputs use Supabase's native signed upload URL, which is single-use and
 *    refuses to overwrite an existing object. Inputs still use presigned GET.
 *
 * Output keys are unique per grant and never reused, and the authority
 * verifies the object (HEAD + size) before accepting a result.
 */
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { MediaPresigner } from "@cineforge/model-adapters";

export class S3Presigner implements MediaPresigner {
  readonly kind: string = "s3-presign";
  protected readonly s3: S3Client;

  constructor(protected readonly bucket = process.env.S3_BUCKET!) {
    this.s3 = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! },
    });
  }

  async presignGet(key: string, ttlSec: number): Promise<string> {
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttlSec });
  }

  async presignPut(key: string, contentType: string, ttlSec: number): Promise<string> {
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    return getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), { expiresIn: ttlSec });
  }

  async head(key: string): Promise<{ size: number } | null> {
    try {
      const r = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: Number(r.ContentLength ?? 0) };
    } catch {
      return null;
    }
  }
}

export class SupabaseSignedUploadPresigner extends S3Presigner {
  override readonly kind = "supabase-signed-upload";

  constructor(
    private readonly supabaseUrl = process.env.SUPABASE_URL!,
    private readonly serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!,
    bucket = process.env.SUPABASE_STORAGE_BUCKET ?? process.env.S3_BUCKET!,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    super(bucket);
    if (!supabaseUrl || !serviceKey) throw new Error("GPU_UPLOAD_URL_MODE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  /** Single-use upload URL (Supabase-fixed validity); upsert is never enabled, so it cannot overwrite. */
  override async presignPut(key: string): Promise<string> {
    const base = this.supabaseUrl.replace(/\/+$/, "");
    const path = key.split("/").map(encodeURIComponent).join("/");
    const res = await this.fetchImpl(`${base}/storage/v1/object/upload/sign/${this.bucket}/${path}`, {
      method: "POST",
      headers: { apikey: this.serviceKey, authorization: `Bearer ${this.serviceKey}`, "content-type": "application/json" },
      body: "{}",
    });
    if (!res.ok) throw new Error(`supabase signed upload url ${res.status}: ${await res.text()}`);
    const { url } = (await res.json()) as { url: string };
    return `${base}/storage/v1${url}`;
  }
}

export function buildPresigner(env: NodeJS.ProcessEnv = process.env): MediaPresigner | null {
  if (!env.S3_BUCKET || !env.S3_ACCESS_KEY) return null;
  return env.GPU_UPLOAD_URL_MODE === "supabase" ? new SupabaseSignedUploadPresigner() : new S3Presigner();
}
