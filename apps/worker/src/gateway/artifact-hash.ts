/**
 * Content hash of a stored artifact (authz v2, docs/39 §9.1). Streams the object
 * through SHA-256 via a temp file, so multi-hundred-MB LoRAs never sit in memory.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Storage } from "../storage/storage";

export async function sha256File(path: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest("hex");
}

export async function sha256OfObject(storage: Pick<Storage, "download">, key: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cf-hash-"));
  try {
    const path = join(dir, "artifact");
    await storage.download(key, path);
    return await sha256File(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
