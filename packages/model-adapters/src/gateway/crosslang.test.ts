/**
 * Cross-language contract with apps/gpu-worker/app/gateway (Python):
 *  - the authorization digest golden vector is the one asserted in
 *    apps/gpu-worker/tests/test_authz_manifest.py;
 *  - a token minted here with a fixed key and clock must equal the committed
 *    fixture, which the Python suite verifies (tests/test_crosslang.py).
 * Ed25519 signatures are deterministic, so the token bytes are stable.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { authzDigest } from "./authz";
import { mintExecutionToken, parseSigningKey } from "./token";

const FIXTURE = fileURLToPath(new URL("../../../../apps/gpu-worker/tests/fixtures/crosslang.json", import.meta.url));
const SEED = Buffer.alloc(32, 7).toString("base64url");

export function buildFixture() {
  const key = parseSigningKey(`kfix:${SEED}`);
  const authz = authzDigest({
    version: 1,
    workflow: "diffusers.wan-2.1.t2v@1",
    runtime: "diffusers@0.33.1",
    models: [{ role: "t2v", id: "Wan-AI/Wan2.1-T2V-1.3B-Diffusers", revision: "a".repeat(40), weights: "f".repeat(64) }],
    loras: ["projects/p1/identities/c1/v1/lora.safetensors"],
    timing: { durationUs: 5_000_000, fps: 16, width: 832, height: 480 },
  });
  const body = JSON.stringify({ jobId: "g_fixture", prompt: "a lighthouse at dusk", durationSec: 5, width: 832, height: 480, fps: 16 });
  const { token } = mintExecutionToken({
    key, deploymentId: "dep-fixture", subject: "g_fixture", scope: "video:run", body, authz,
    now: 1_800_000_000, jti: "jti-fixture", ttlSec: 120,
  });
  return { publicKey: `kfix:${key.publicKeyB64}`, deploymentId: "dep-fixture", now: 1_800_000_000, body, authz, token };
}

describe("cross-language gateway contract", () => {
  it("authz v1 golden vector (deployments still on v1)", () => {
    expect(buildFixture().authz).toBe("07d602c7d909cf6fdfa2ca4c84469320aee4d651d4e81ab0b752d957e8754084");
  });

  it("authz v2 golden vector matches Python (LoRA bound by content hash)", () => {
    const v2 = authzDigest({
      version: 2,
      workflow: "diffusers.wan-2.1.t2v@1",
      runtime: "diffusers@0.33.1",
      models: [{ role: "t2v", id: "Wan-AI/Wan2.1-T2V-1.3B-Diffusers", revision: "a".repeat(40), weights: "f".repeat(64) }],
      loras: [{ key: "projects/p1/identities/c1/v1/lora.safetensors", sha256: "ab".repeat(32) }],
      timing: { durationUs: 5_000_000, fps: 16, width: 832, height: 480 },
    });
    // Same value asserted in apps/gpu-worker/tests/test_authz_manifest.py (GOLDEN_V2).
    expect(v2).toBe("93e92cbba5c7b7f203603ac53e249e2538bfd45e2ec825eef7d6c3faaa7775dc");
  });

  it("minted token equals the committed fixture the Python verifier checks", () => {
    const fx = buildFixture();
    if (process.env.UPDATE_FIXTURES === "1") writeFileSync(FIXTURE, JSON.stringify(fx, null, 2) + "\n");
    expect(JSON.parse(readFileSync(FIXTURE, "utf8"))).toEqual(fx);
  });
});
