/**
 * Real-provider tests (DirectorOS Part 2 §76; W10).
 *
 *   pnpm --filter @cineforge/worker providers:live [--only planning,voice] [--require planning,image,video,voice,music] [--out report.json] [--record]
 *
 * Spends real money (one small call per configured provider). Run it where the
 * provider credentials live — the deployed worker's environment, or the manual
 * GitHub workflow `evaluation.yml` (run: providers). Exit 0 = every required capability has
 * a provider that really generated a verified artifact; 1 = a configured
 * provider failed; 3 = incomplete (something required is not configured or is
 * gated). Self-hosted video calls are authorized through the Media Runtime
 * Gateway like production (report mode unless a deployment is enforced).
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allProbes, runProbes, type ProbeDeps } from "./probes";
import { exitCode, formatReport, parseRequired, suiteVerdict, type Capability } from "./report";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const required = parseRequired(arg("require"));
  const only = arg("only") ? parseRequired(arg("only")) : null;
  const probes = allProbes().filter((p) => !only || only.includes(p.capability));
  const dir = await mkdtemp(join(tmpdir(), "cf-providers-"));
  const deps: Omit<ProbeDeps, "dir"> = { env: process.env, fetch };
  if (process.env.S3_BUCKET) {
    // Storage and the gateway are loaded only when video can run (they need S3 / the database).
    const [{ S3Storage }, { buildGatewayAuthority }] = await Promise.all([import("../storage/storage"), import("../gateway")]);
    const storage = new S3Storage();
    deps.download = (key, to) => storage.download(key, to);
    deps.videoHooks = () => ({
      gpuAuthorizer: process.env.DATABASE_URL ? buildGatewayAuthority() : undefined,
      saveVideo: (key, bytes, contentType) => storage.putBytes(key, bytes, contentType),
      getImageBytes: async (key) => ({ bytes: await storage.getBytes(key), contentType: "image/png" }),
    });
  }
  try {
    const results = await runProbes(probes, { ...deps, dir }, (r) => console.log(`${r.status.padEnd(14)} ${r.id}${r.reason ? ` — ${r.reason}` : ""}`));
    const verdict = suiteVerdict(results, only ? required.filter((c) => only.includes(c)) as Capability[] : required);
    const report = { at: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? process.env.SOURCE_COMMIT ?? null, verdict, results };
    const out = arg("out");
    if (out) await writeFile(out, JSON.stringify(report, null, 2));
    if (process.argv.includes("--record")) {
      const [{ prisma }, { recordBenchmarkRun }] = await Promise.all([import("@cineforge/db"), import("../bench/record")]);
      const id = await recordBenchmarkRun(prisma as never, {
        suite: "providers", status: verdict.status === "PASS" ? "pass" : verdict.status === "FAIL" ? "fail" : "incomplete", score: null,
        metrics: { verdict }, cases: results,
      });
      console.log(`recorded benchmark_runs ${id}`);
    }
    console.log(formatReport([], verdict));
    return exitCode(verdict);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main()
  .then(async (code) => {
    if (process.env.DATABASE_URL) await (await import("@cineforge/db")).prisma.$disconnect().catch(() => undefined);
    process.exit(code);
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
