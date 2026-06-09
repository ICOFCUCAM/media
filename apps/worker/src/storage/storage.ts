import { createWriteStream, createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

/** Storage port used by the render engine — easy to fake in tests. */
export interface Storage {
  download(key: string, destPath: string): Promise<void>;
  upload(srcPath: string, key: string, contentType?: string): Promise<void>;
  /** Upload every file under `dir`, keyed as `${keyPrefix}/${relativePath}`. */
  uploadDir(dir: string, keyPrefix: string): Promise<void>;
}

export class S3Storage implements Storage {
  private readonly s3: S3Client;
  constructor(private readonly bucket = process.env.S3_BUCKET!) {
    this.s3 = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
    });
  }

  async download(key: string, destPath: string): Promise<void> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    await pipeline(res.Body as Readable, createWriteStream(destPath));
  }

  async upload(srcPath: string, key: string, contentType?: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(srcPath),
        ContentType: contentType,
      }),
    );
  }

  /** Upload raw bytes (used by provider adapters that return PNG/MP3 in-memory). */
  async putBytes(key: string, bytes: Uint8Array, contentType?: string): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: Buffer.from(bytes), ContentType: contentType }),
    );
    return key;
  }

  async uploadDir(dir: string, keyPrefix: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true } as { withFileTypes: true });
    await Promise.all(
      entries
        .filter((e) => e.isFile())
        .map((e) => {
          const full = join((e as { parentPath?: string; path?: string }).parentPath ?? dir, e.name);
          const rel = relative(dir, full);
          const ct = rel.endsWith(".m3u8")
            ? "application/vnd.apple.mpegurl"
            : rel.endsWith(".ts")
              ? "video/mp2t"
              : undefined;
          return this.upload(full, `${keyPrefix}/${rel}`, ct);
        }),
    );
  }
}
