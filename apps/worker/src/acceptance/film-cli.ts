/**
 * The ultimate acceptance test (DirectorOS Part 2 §81; W10).
 *
 *   pnpm --filter @cineforge/worker film:accept --user <ownerUuid> [--brief "..."] [--target 180] [--resolution 720p] [--aspect 16:9] [--timeout-min 240]
 *   pnpm --filter @cineforge/worker film:accept --project <projectId>      check a film that already finished
 *
 * With --user it creates the production the way the studio does (a project in
 * PLANNING, mode auto — the worker's poller claims it), waits for READY or
 * FAILED, then runs the sixteen checks of §81.2 on the delivered master and
 * the database, records the run in acceptance_runs (migration 0043), and
 * prints END_TO_END_MOVIE_PIPELINE: PASS only when all sixteen pass.
 *
 * Runs against PRODUCTION infrastructure (DATABASE_URL, S3, the deployed
 * worker and GPU): it spends real generation money for one 3-minute film.
 * The test project is charged no credits (it is created here, not through
 * checkout). Exit 0 = PASS, 1 = FAIL, 2 = usage, 4 = the film never finished.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { prisma } from "@cineforge/db";
import { S3Storage } from "../storage/storage";
import { gitSha, jsonSafe } from "../bench/record";
import { isMissingTable } from "../timeline/store";
import { filmVerdict, formatFilmChecks, runFilmChecks } from "./film-checks";
import { gatherFilmEvidence, type FilmEvidenceDb } from "./film-evidence";

/** Part 2 §81.1, verbatim. */
export const ACCEPTANCE_BRIEF =
  "Create a 3-minute cinematic short film about a woman arriving at an abandoned railway station at night and discovering that someone has left a message for her.";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const TERMINAL = new Set(["READY", "FAILED", "REVIEW"]);

async function createProduction(userId: string, brief: string, targetSec: number): Promise<string> {
  const p = await prisma.project.create({
    data: {
      userId, title: `Acceptance ${new Date().toISOString().slice(0, 16)}`, prompt: brief, targetSeconds: targetSec,
      resolution: arg("resolution") ?? "720p", aspectRatio: arg("aspect") ?? "16:9", modelId: process.env.ACCEPTANCE_MODEL_ID ?? "wan-2.1",
      status: "PLANNING", mode: "auto",
    },
    select: { id: true },
  });
  return p.id;
}

async function waitForFilm(projectId: string, timeoutMin: number): Promise<string> {
  const deadline = Date.now() + timeoutMin * 60_000;
  let last = "";
  for (;;) {
    const p = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true, progress: true, errorMessage: true } });
    if (!p) throw new Error(`project ${projectId} disappeared`);
    const line = `${p.status} ${(p.progress * 100).toFixed(0)}%${p.errorMessage ? ` — ${p.errorMessage}` : ""}`;
    if (line !== last) console.log(`[${new Date().toISOString().slice(11, 19)}] ${line}`);
    last = line;
    if (TERMINAL.has(p.status)) return p.status;
    if (Date.now() > deadline) return `TIMEOUT (${p.status})`;
    await sleep(30_000);
  }
}

async function main(): Promise<number> {
  const startedAt = new Date();
  let projectId = arg("project");
  const brief = arg("brief") ?? ACCEPTANCE_BRIEF;
  const targetSec = Number(arg("target") ?? 180);
  if (!projectId) {
    const user = arg("user");
    if (!user) {
      console.error("usage: film:accept --user <ownerUuid> [--brief ...] [--target 180]  |  film:accept --project <projectId>");
      return 2;
    }
    projectId = await createProduction(user, brief, targetSec);
    console.log(`created production ${projectId} (${targetSec}s): ${brief}`);
    const status = await waitForFilm(projectId, Number(arg("timeout-min") ?? 240));
    if (status !== "READY") console.error(`the film did not finish READY: ${status}`);
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { prompt: true, targetSeconds: true } });
  if (!project) {
    console.error(`project ${projectId} not found`);
    return 2;
  }
  const storage = new S3Storage();
  const dir = await mkdtemp(join(tmpdir(), "cf-accept-"));
  try {
    const evidence = await gatherFilmEvidence(prisma as unknown as FilmEvidenceDb, projectId, (k, to) => storage.download(k, to), dir);
    const checks = runFilmChecks(evidence);
    const verdict = filmVerdict(checks);
    console.log(formatFilmChecks(checks));
    try {
      const row = await prisma.acceptanceRun.create({
        data: {
          projectId, brief: project.prompt.slice(0, 2000), targetSec: project.targetSeconds, verdict, checks: jsonSafe(checks) as object,
          masterKey: evidence.master.key, gitSha: gitSha(), startedAt,
        },
        select: { id: true },
      });
      console.log(`recorded acceptance_runs ${row.id}`);
    } catch (e) {
      if (isMissingTable(e)) console.error("acceptance_runs does not exist — apply migration 0043; this run is NOT recorded");
      else throw e;
    }
    return verdict === "PASS" ? 0 : 1;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main()
  .then((code) => prisma.$disconnect().then(() => process.exit(code)))
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
