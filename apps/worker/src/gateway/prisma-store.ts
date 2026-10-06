/** GatewayStore on the worker's Prisma connection (migration 0026). */
import { Prisma, prisma } from "@cineforge/db";
import type {
  GatewayEvent,
  GatewayStore,
  GrantRecord,
  RuntimeDeployment,
  RuntimeManifest,
} from "@cineforge/model-adapters";

type Row = Awaited<ReturnType<typeof prisma.runtimeDeployment.findUnique>>;

function toDeployment(r: NonNullable<Row>): RuntimeDeployment {
  return {
    id: r.id,
    modelId: r.modelId,
    baseUrl: r.baseUrl,
    runpodPodId: r.runpodPodId,
    status: r.status as RuntimeDeployment["status"],
    enforcement: r.enforcement === "enforce" ? "enforce" : "report",
    manifest: (r.manifest as unknown as RuntimeManifest | null) ?? null,
    approvedImage: r.approvedImage,
  };
}

const norm = (u: string) => u.replace(/\/+$/, "");

export class PrismaGatewayStore implements GatewayStore {
  async deploymentByUrl(baseUrl: string) {
    const r = await prisma.runtimeDeployment.findFirst({ where: { baseUrl: { in: [norm(baseUrl), `${norm(baseUrl)}/`] } } });
    return r ? toDeployment(r) : null;
  }

  async deploymentById(id: string) {
    const r = await prisma.runtimeDeployment.findUnique({ where: { id } });
    return r ? toDeployment(r) : null;
  }

  async saveDeployment(d: RuntimeDeployment) {
    const data = {
      modelId: d.modelId,
      baseUrl: norm(d.baseUrl),
      runpodPodId: d.runpodPodId,
      status: d.status,
      enforcement: d.enforcement,
      manifest: d.manifest ? (d.manifest as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      approvedImage: d.approvedImage,
    };
    await prisma.runtimeDeployment.upsert({ where: { id: d.id }, create: { id: d.id, ...data }, update: data });
  }

  async insertGrant(g: GrantRecord) {
    await prisma.runtimeExecutionGrant.create({
      data: {
        id: g.id,
        jti: g.jti,
        deploymentId: g.deploymentId,
        shotId: g.shotId,
        projectId: g.projectId,
        scope: g.scope,
        mode: g.mode,
        authzDigest: g.authzDigest,
        bodySha256: g.bodySha256,
        inputKeys: g.inputKeys,
        outputKeys: g.outputKeys,
        imageRef: g.imageRef,
        issuedAt: g.issuedAt,
        expiresAt: g.expiresAt,
        outcome: g.outcome,
        errorCode: g.errorCode,
      },
    });
  }

  async updateGrant(id: string, patch: Partial<GrantRecord>) {
    await prisma.runtimeExecutionGrant.update({
      where: { id },
      data: {
        outcome: patch.outcome,
        errorCode: patch.errorCode,
        gpuMs: patch.gpuMs ?? undefined,
        outputBytes: patch.outputBytes == null ? undefined : BigInt(patch.outputBytes),
        completedAt: patch.completedAt ?? undefined,
      },
    });
  }

  async insertEvent(e: GatewayEvent) {
    await prisma.runtimeGatewayEvent.create({
      data: {
        type: e.type,
        deploymentId: e.deploymentId,
        grantId: e.grantId,
        code: e.code,
        detail: e.detail as Prisma.InputJsonValue,
        actor: e.actor,
      },
    });
  }
}
