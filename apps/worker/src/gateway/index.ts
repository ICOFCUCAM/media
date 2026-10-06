/**
 * Media Runtime Gateway wiring for the worker (docs/39).
 *
 * Env (all optional; nothing here turns enforcement on by itself):
 *   GPU_JWT_SIGNING_KEY   kid:base64url(32-byte Ed25519 seed). Without it, calls
 *                         stay unsigned (report mode records them).
 *   GPU_GATEWAY_MODE      report (default) | enforce — a global floor. Per
 *                         deployment, enforcement is the runtime_deployments
 *                         row, changed only through the admin script.
 *   GPU_UPLOAD_URL_MODE   s3 (default) | supabase — output upload URL kind.
 *   RUNPOD_API_KEY        control-plane lookup of the running image digest.
 */
import { GatewayAuthority, parseSigningKey, type EnforcementMode } from "@cineforge/model-adapters";

import { RunpodImageAttestor } from "./attestor";
import { buildPresigner } from "./presigners";
import { PrismaGatewayStore } from "./prisma-store";

export function buildGatewayAuthority(env: NodeJS.ProcessEnv = process.env): GatewayAuthority {
  const mode: EnforcementMode = env.GPU_GATEWAY_MODE === "enforce" ? "enforce" : "report";
  if (env.GPU_GATEWAY_MODE && !["report", "enforce"].includes(env.GPU_GATEWAY_MODE)) {
    // Never let a typo silently mean "no enforcement".
    throw new Error(`GPU_GATEWAY_MODE must be report or enforce, got ${env.GPU_GATEWAY_MODE}`);
  }
  return new GatewayAuthority({
    store: new PrismaGatewayStore(),
    signingKey: env.GPU_JWT_SIGNING_KEY ? parseSigningKey(env.GPU_JWT_SIGNING_KEY) : null,
    presigner: buildPresigner(env),
    attestor: env.RUNPOD_API_KEY ? new RunpodImageAttestor(env.RUNPOD_API_KEY) : null,
    globalMode: mode,
    // Clips written before the gateway live under _generated/; they stay readable as inputs.
    legacyInputPrefixes: ["_generated/"],
  });
}

export { PrismaGatewayStore } from "./prisma-store";
export { RunpodImageAttestor } from "./attestor";
export { S3Presigner, SupabaseSignedUploadPresigner, buildPresigner } from "./presigners";
