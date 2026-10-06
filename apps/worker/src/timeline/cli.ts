/**
 * Operator command: build a draft production timeline for a project from its
 * current scenes / shots / dialogue / audio and save it as the next version.
 *
 *   pnpm --filter @cineforge/worker timeline:build <projectId> [--fps 24] [--profile cinematic] [--dry-run]
 *
 * Writes only the new DRAFT version (nothing is approved, nothing existing
 * changes). Requires migrations 0028–0030; without them it says so.
 */
import { buildTimelineDraft, MasterClock, syncPolicy, usToJson, usToTimecode } from "@cineforge/shared";
import { prisma } from "@cineforge/db";
import { loadProjectSource, saveTimelineDraft, type TimelineDb } from "./store";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

async function main(): Promise<number> {
  const projectId = process.argv[2];
  if (!projectId || projectId.startsWith("--")) {
    console.error("usage: timeline:build <projectId> [--fps 24] [--profile cinematic] [--dry-run]");
    return 2;
  }
  const db = prisma as unknown as TimelineDb;
  const clock = new MasterClock({ fps: arg("fps", "24")! });
  const policy = syncPolicy(arg("profile", "cinematic"));
  const draft = buildTimelineDraft({ scenes: await loadProjectSource(db, projectId), clock });
  console.log(JSON.stringify({
    clock: clock.id,
    durationUs: usToJson(draft.durationUs),
    duration: usToTimecode(draft.durationUs, clock.fps),
    events: draft.events.length,
    audio: draft.audio.length,
    warnings: draft.warnings,
  }, null, 2));
  if (process.argv.includes("--dry-run")) return 0;
  const saved = await saveTimelineDraft(db, projectId, draft, policy);
  console.log(JSON.stringify(saved));
  return saved.saved ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
