/**
 * Operator CLI for GPU deployments (docs/39). Every command is recorded in
 * runtime_gateway_events with the operator's name.
 *
 *   pnpm --filter @cineforge/worker gateway:admin register --id dep-wan-1 --model wan-2.1 --url https://<pod>-8000.proxy.runpod.net --pod <podId>
 *   pnpm --filter @cineforge/worker gateway:admin approve  --id dep-wan-1 --image <user>/cineforge-gpu@sha256:<digest>
 *   pnpm --filter @cineforge/worker gateway:admin enforce  --id dep-wan-1
 *   pnpm --filter @cineforge/worker gateway:admin report   --id dep-wan-1 --reason "<why>"
 *   pnpm --filter @cineforge/worker gateway:admin status   --id dep-wan-1
 *   pnpm --filter @cineforge/worker gateway:admin keygen   [--kid k1]
 *
 * Needs DATABASE_URL, GPU_JWT_SIGNING_KEY, RUNPOD_API_KEY and GATEWAY_OPERATOR.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import { prisma } from "@cineforge/db";
import { GatewayAdmin, parseSigningKey } from "@cineforge/model-adapters";

import { RunpodImageAttestor } from "./attestor";
import { PrismaGatewayStore } from "./prisma-store";

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { values: a } = parseArgs({
    args: rest,
    options: {
      id: { type: "string" }, model: { type: "string" }, url: { type: "string" }, pod: { type: "string" },
      image: { type: "string" }, reason: { type: "string" }, kid: { type: "string" },
    },
  });

  if (cmd === "keygen") {
    // Private seed goes to the worker (Render secret); the public key to each GPU pod.
    const kid = a.kid ?? `k${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
    const key = parseSigningKey(`${kid}:${randomBytes(32).toString("base64url")}`);
    const seed = key.privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32).toString("base64url");
    console.log(`GPU_JWT_SIGNING_KEY=${kid}:${seed}     # worker only — secret`);
    console.log(`GPU_JWT_PUBLIC_KEYS=${kid}:${key.publicKeyB64}   # GPU pods`);
    return;
  }

  const need = (k: keyof typeof a) => {
    const v = a[k];
    if (!v) throw new Error(`--${k} is required`);
    return v;
  };
  const env = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`${k} is required`);
    return v;
  };
  const admin = new GatewayAdmin({
    store: new PrismaGatewayStore(),
    signingKey: parseSigningKey(env("GPU_JWT_SIGNING_KEY")),
    attestor: new RunpodImageAttestor(env("RUNPOD_API_KEY")),
    actor: `operator:${env("GATEWAY_OPERATOR")}`,
  });

  let out: unknown;
  switch (cmd) {
    case "register":
      out = await admin.register({ id: need("id"), modelId: need("model"), baseUrl: need("url"), runpodPodId: a.pod ?? null });
      break;
    case "approve":
      out = await admin.approve(need("id"), need("image"));
      break;
    case "enforce":
      out = await admin.enforce(need("id"));
      break;
    case "report":
      out = await admin.report(need("id"), need("reason"));
      break;
    case "status":
      out = await new PrismaGatewayStore().deploymentById(need("id"));
      break;
    default:
      throw new Error("usage: gateway:admin register|approve|enforce|report|status|keygen …");
  }
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
