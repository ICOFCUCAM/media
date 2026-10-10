/**
 * The repair engine (docs/38 §AU.7 Phase 9; DirectorOS Part 1 §39–40; W27).
 *
 * The sync check after a render plans repairs (repair-planner) and saves them
 * as `repair_jobs` (0030). This carries them out:
 *
 *   retime_clip / hold_last_frame / trim_tail / conform_frame_rate
 *       the shot's clip is re-encoded to fit its slot and stored as a new
 *       version of the shot; the shot points at it
 *   regenerate_shot / regenerate_tail
 *       the shot is queued to generate again (a new gateway authorization, as
 *       every generation) — at most SYNC_REPAIR_MAX_REGEN times per shot
 *   normalize_loudness
 *       not needed: every master is loudness-corrected when it renders (W23)
 *   shift_audio / reanchor / rebuild_subtitles
 *       placement decisions: cancelled with the reason, left to the owner
 *
 * SYNC_REPAIR=off (default) | clips | all. Every job moves planned → running
 * → succeeded / failed / cancelled (the 0030 guard keeps the action itself
 * immutable). The caller renders the film again once after clip repairs.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepairAction } from "@cineforge/shared";

export type RepairMode = "off" | "clips" | "all";

export function repairMode(env: NodeJS.ProcessEnv = process.env): RepairMode {
  const v = (env.SYNC_REPAIR ?? "off").trim().toLowerCase();
  return v === "clips" || v === "all" ? v : "off";
}

const CLIP = new Set(["retime_clip", "hold_last_frame", "trim_tail", "conform_frame_rate"]);
const REGEN = new Set(["regenerate_shot", "regenerate_tail"]);
const us = (v: unknown) => Number(v) / 1e6;
const sec = (n: number) => Math.max(0, n).toFixed(3);

/**
 * The ffmpeg arguments for one clip repair (pure). `durationSec` is the
 * clip's measured length. Clips carry no sound (speech is mixed from its own
 * tracks), so the output is picture only.
 */
export function repairClipArgs(action: RepairAction, input: string, output: string, durationSec: number): string[] {
  const enc = ["-an", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output];
  switch (action.kind) {
    case "retime_clip": {
      // ratio = measured / slot; stretching by 1/ratio lands on the slot.
      const factor = 1 / action.ratio;
      if (!Number.isFinite(factor) || factor <= 0) throw new Error(`invalid retime ratio ${action.ratio}`);
      return ["-y", "-i", input, "-filter:v", `setpts=${factor.toFixed(6)}*PTS`, "-t", sec(us(action.toDurationUs)), ...enc];
    }
    case "hold_last_frame":
      return ["-y", "-i", input, "-filter:v", `tpad=stop_mode=clone:stop_duration=${sec(us(action.addUs))}`, ...enc];
    case "trim_tail": {
      const keep = durationSec - us(action.removeUs);
      if (keep <= 0) throw new Error(`trimming ${sec(us(action.removeUs))}s leaves nothing of a ${sec(durationSec)}s clip`);
      return ["-y", "-i", input, "-t", sec(keep), ...enc];
    }
    case "conform_frame_rate":
      if (!/^\d+(\/\d+)?$/.test(action.toFps)) throw new Error(`invalid frame rate ${action.toFps}`);
      return ["-y", "-i", input, "-filter:v", `fps=${action.toFps}`, ...enc];
    default:
      throw new Error(`${action.kind} is not a clip repair`);
  }
}

/** Why a job is not carried out (null = it is). Pure. */
export function repairDecision(action: RepairAction, mode: RepairMode, priorRegens: number, maxRegens: number): { run: "clip" | "regenerate" } | { skip: "cancel" | "wait"; reason: string } {
  if (mode === "off") return { skip: "wait", reason: "repairs are off (SYNC_REPAIR)" };
  if (CLIP.has(action.kind)) return { run: "clip" };
  if (REGEN.has(action.kind)) {
    if (mode !== "all") return { skip: "wait", reason: "regenerations need SYNC_REPAIR=all" };
    if (priorRegens >= maxRegens) return { skip: "cancel", reason: `the shot was already regenerated ${priorRegens} time(s) by sync repair` };
    return { run: "regenerate" };
  }
  if (action.kind === "normalize_loudness") return { skip: "cancel", reason: "every master is loudness-corrected when it renders" };
  if (action.kind === "rebuild_subtitles") return { skip: "cancel", reason: "subtitles are rebuilt from the dialogue when the film is localized" };
  if (action.kind === "human_review") return { skip: "cancel", reason: action.reason };
  return { skip: "cancel", reason: `${action.kind} is a placement decision for the owner` };
}

export interface RepairJobRow { id: string; issueId: string; action: unknown; status: string }

export interface RepairDb {
  avSyncIssue: {
    findMany(a: unknown): Promise<{ id: string; shotId: string | null }[]>;
    updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  repairJob: {
    findMany(a: unknown): Promise<RepairJobRow[]>;
    count(a: unknown): Promise<number>;
    updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
  shot: {
    findUnique(a: unknown): Promise<{ id: string; videoKey: string | null } | null>;
    update(a: { where: { id: string }; data: Record<string, unknown>; select?: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface RepairDeps {
  download(key: string, dest: string): Promise<void>;
  upload(src: string, key: string): Promise<void>;
  ffmpeg(args: string[]): Promise<void>;
  probe(path: string): Promise<number>;
  /** Records the repaired clip as a new version of the shot; returns its id. */
  version(v: { projectId: string; shotId: string; storageKey: string; durationSec: number; derivedFrom: string; action: RepairAction }): Promise<string | null>;
}

export interface RepairOutcome { clips: number; regenerating: number; cancelled: number; waiting: number; failed: number }

/** Carry out the planned repairs of one sync report. */
export async function executeRepairs(
  db: RepairDb,
  deps: RepairDeps,
  a: { projectId: string; reportId: string; mode?: RepairMode; maxRegens?: number },
): Promise<RepairOutcome> {
  const out: RepairOutcome = { clips: 0, regenerating: 0, cancelled: 0, waiting: 0, failed: 0 };
  const mode = a.mode ?? repairMode();
  const maxRegens = a.maxRegens ?? Math.max(0, Number(process.env.SYNC_REPAIR_MAX_REGEN ?? 1) || 0);
  const issues = await db.avSyncIssue.findMany({ where: { reportId: a.reportId }, select: { id: true, shotId: true } });
  if (!issues.length) return out;
  const shotOfIssue = new Map(issues.map((i) => [i.id, i.shotId]));
  const jobs = await db.repairJob.findMany({ where: { issueId: { in: issues.map((i) => i.id) }, status: "planned" }, orderBy: { createdAt: "asc" } });
  const finish = (id: string, status: "succeeded" | "failed" | "cancelled", data: Record<string, unknown> = {}) =>
    db.repairJob.updateMany({ where: { id, status: { in: ["planned", "running"] } }, data: { status, ...data } });
  const setIssue = (id: string, status: "repairing" | "resolved") =>
    db.avSyncIssue.updateMany({ where: { id, status: { in: status === "resolved" ? ["open", "repairing"] : ["open"] } }, data: { status } });

  for (const job of jobs) {
    const action = job.action as RepairAction;
    const shotId = ("shotId" in action ? action.shotId : null) ?? shotOfIssue.get(job.issueId) ?? null;
    const prior = shotId && REGEN.has(action.kind)
      ? await db.repairJob.count({ where: { status: "succeeded", action: { path: ["shotId"], equals: shotId } } })
      : 0;
    const d = repairDecision(action, mode, prior, maxRegens);
    if ("skip" in d) {
      if (d.skip === "cancel") { await finish(job.id, "cancelled", { error: d.reason.slice(0, 500) }); out.cancelled++; }
      else out.waiting++;
      continue;
    }
    if (!shotId) { await finish(job.id, "cancelled", { error: "the repair names no shot" }); out.cancelled++; continue; }
    if ((await db.repairJob.updateMany({ where: { id: job.id, status: "planned" }, data: { status: "running" } })).count !== 1) continue;
    try {
      const shot = await db.shot.findUnique({ where: { id: shotId }, select: { id: true, videoKey: true } });
      if (!shot) throw new Error("the shot is gone");
      if (d.run === "regenerate") {
        await db.shot.update({ where: { id: shotId }, data: { status: "PENDING", videoKey: null, thumbnailKey: null, qcScore: null, attempts: 0 }, select: { id: true } });
        await finish(job.id, "succeeded");
        await setIssue(job.issueId, "repairing");
        out.regenerating++;
        continue;
      }
      if (!shot.videoKey) throw new Error("the shot has no clip to repair");
      const dir = await mkdtemp(join(tmpdir(), "cf-repair-"));
      try {
        const src = join(dir, "in.mp4");
        const dst = join(dir, "out.mp4");
        await deps.download(shot.videoKey, src);
        await deps.ffmpeg(repairClipArgs(action, src, dst, await deps.probe(src)));
        const durationSec = await deps.probe(dst);
        const key = `projects/${a.projectId}/shots/${shotId}/repair-${job.id.slice(0, 8)}.mp4`;
        await deps.upload(dst, key);
        const versionId = await deps.version({ projectId: a.projectId, shotId, storageKey: key, durationSec, derivedFrom: shot.videoKey, action });
        await db.shot.update({ where: { id: shotId }, data: { videoKey: key }, select: { id: true } });
        await finish(job.id, "succeeded", versionId ? { resultMediaVersionId: versionId } : {});
        await setIssue(job.issueId, "resolved");
        out.clips++;
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    } catch (e) {
      await finish(job.id, "failed", { error: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
      out.failed++;
    }
  }
  return out;
}
