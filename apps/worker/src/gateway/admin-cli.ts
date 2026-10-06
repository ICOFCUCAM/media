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
 *   pnpm --filter @cineforge/worker gateway:admin hash-loras        (record content hashes of existing LoRAs)
 *
 * Needs DATABASE_URL, GPU_JWT_SIGNING_KEY, RUNPOD_API_KEY and GATEWAY_OPERATOR.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import { prisma } from "@cineforge/db";
import { GatewayAdmin, parseSigningKey } from "@cineforge/model-adapters";

import { S3Storage } from "../storage/storage";
import { sha256OfObject } from "./artifact-hash";
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

  if (cmd === "hash-loras") {
    // Content-address every LoRA that predates authz v2. Hashes come from the
    // bytes in storage; a missing object is reported, never guessed.
    const storage = new S3Storage();
    const store = new PrismaGatewayStore();
    const rows = await prisma.character.findMany({ where: { loraKey: { not: null }, loraSha256: null }, select: { id: true, loraKey: true } });
    let hashed = 0;
    for (const r of rows) {
      try {
        const loraSha256 = await sha256OfObject(storage, r.loraKey!);
        await prisma.character.update({ where: { id: r.id }, data: { loraSha256 } });
        await store.insertEvent({ type: "artifact.hashed", deploymentId: null, grantId: null, code: "lora", actor: `operator:${process.env.GATEWAY_OPERATOR ?? "unknown"}`,
          detail: { characterId: r.id, key: r.loraKey, sha256: loraSha256 } });
        hashed++;
        console.log(`hashed ${r.loraKey} ${loraSha256}`);
      } catch (e) {
        console.error(`could not hash ${r.loraKey}: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log(JSON.stringify({ candidates: rows.length, hashed }));
    return;
  }

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
      throw new Error("usage: gateway:admin register|approve|enforce|report|status|keygen|hash-loras …");
  }
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
