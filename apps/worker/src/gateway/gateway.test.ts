import { describe, expect, it, vi } from "vitest";

import { RunpodImageAttestor } from "./attestor";
import { S3Presigner, SupabaseSignedUploadPresigner } from "./presigners";

const DEP = {
  id: "dep-1", modelId: "wan-2.1", baseUrl: "https://pod", runpodPodId: "pod-1",
  status: "approved" as const, enforcement: "report" as const, manifest: null, approvedImage: null,
};

describe("RunpodImageAttestor", () => {
  it("returns the image the RunPod control plane says the pod runs", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ data: { pod: { id: "pod-1", imageName: "u/cineforge-gpu@sha256:" + "ab".repeat(32) } } })));
    const img = await new RunpodImageAttestor("key", "https://api", f as unknown as typeof fetch).runningImage(DEP);
    expect(img).toBe("u/cineforge-gpu@sha256:" + "ab".repeat(32));
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).variables).toEqual({ id: "pod-1" });
  });

  it("is null (unattested) for another pod, an error, or no pod id", async () => {
    const other = vi.fn(async () => new Response(JSON.stringify({ data: { pod: { id: "pod-2", imageName: "x" } } })));
    expect(await new RunpodImageAttestor("k", "https://api", other as unknown as typeof fetch).runningImage(DEP)).toBeNull();
    const err = vi.fn(async () => new Response("no", { status: 500 }));
    expect(await new RunpodImageAttestor("k", "https://api", err as unknown as typeof fetch).runningImage(DEP)).toBeNull();
    expect(await new RunpodImageAttestor("k").runningImage({ ...DEP, runpodPodId: null })).toBeNull();
  });
});

describe("presigners", () => {
  it("S3 presigned PUT binds the content type and expiry", async () => {
    process.env.S3_ACCESS_KEY = "AKIATEST";
    process.env.S3_SECRET_KEY = "secret";
    const url = new URL(await new S3Presigner("bucket").presignPut("projects/p1/video/g_1.mp4", "video/mp4", 1800));
    expect(url.pathname).toContain("projects/p1/video/g_1.mp4");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("1800");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("host");
  });

  it("Supabase fallback returns a single-use signed upload URL (never upsert)", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ url: "/object/upload/sign/cineforge-assets/projects/p1/video/g_1.mp4?token=t" })));
    const p = new SupabaseSignedUploadPresigner("https://x.supabase.co", "service", "cineforge-assets", f as unknown as typeof fetch);
    const url = await p.presignPut("projects/p1/video/g_1.mp4");
    expect(url).toBe("https://x.supabase.co/storage/v1/object/upload/sign/cineforge-assets/projects/p1/video/g_1.mp4?token=t");
    const [called, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(called).toBe("https://x.supabase.co/storage/v1/object/upload/sign/cineforge-assets/projects/p1/video/g_1.mp4");
    expect(JSON.stringify(init.headers)).not.toContain("x-upsert");
    expect(p.kind).toBe("supabase-signed-upload");
  });
});

describe("artifact content hash (authz v2)", () => {
  it("hashes the stored bytes, streaming through a temp file", async () => {
    const { createHash } = await import("node:crypto");
    const { writeFile } = await import("node:fs/promises");
    const { sha256OfObject } = await import("./artifact-hash");
    const bytes = Buffer.from("adapter-weights-v1");
    const storage = { download: async (_key: string, dest: string) => writeFile(dest, bytes) };
    expect(await sha256OfObject(storage, "projects/p1/identities/c1/v1/lora.safetensors")).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
});
