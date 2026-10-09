/**
 * Edit requests (DirectorOS W8b; Part 2 §62.9; migration 0039) — the edit
 * command API. An owner asks for one canon change from the web; the worker
 * claims it, checks its shape, applies it through the canon revision path
 * (which refuses a change that breaks canon or touches a locked scene), and
 * regenerates only the shots it invalidated — respecting the film's passes.
 *
 * pending → applying → applied | rejected | failed. Finished is final.
 */
import { z } from "zod";
import type { CanonChange, Issue } from "@cineforge/movie";
import type { AppliedRevision } from "./revision";

const key = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[a-z0-9_]{1,60}$`), `must look like ${prefix}_…`);
const text = (max: number) => z.string().trim().min(1).max(max);

/** The changes an owner may ask for (the same kinds the canon revision path applies). */
export const CanonChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("scene_wardrobe"), sceneId: key("scene"), characterId: key("char"), wardrobe: z.object({ id: key("wardrobe"), description: text(300) }).strict() }).strict(),
  z.object({ kind: z.literal("wardrobe_description"), characterId: key("char"), wardrobeId: key("wardrobe"), description: text(300) }).strict(),
  z.object({
    kind: z.literal("identity"), characterId: key("char"),
    identity: z.object({ face: text(300), hair: text(200), body: text(200), marks: z.array(text(120)).max(6) }).partial().strict(),
    age: z.number().int().min(0).max(120).nullable().optional(),
  }).strict(),
  z.object({ kind: z.literal("physical"), sceneId: key("scene"), characterId: key("char"), physical: z.string().trim().max(200).nullable() }).strict(),
  z.object({
    kind: z.literal("location"), locationId: key("loc"),
    patch: z.object({ description: text(600), architecture: text(400), era: text(120), lighting: text(300) }).partial().strict(),
  }).strict(),
  z.object({ kind: z.literal("prop"), propId: key("prop"), patch: z.object({ name: text(80), description: text(300) }).partial().strict() }).strict(),
]);

export interface EditRequestRow {
  id: string;
  projectId: string;
  requestedBy: string | null;
  change: unknown;
}

export interface EditDeps {
  claim(id: string): Promise<boolean>;
  finish(id: string, data: { status: "applied" | "rejected" | "failed"; issues?: Issue[]; affectedShots?: number; toVersion?: string; error?: string }): Promise<void>;
  apply(projectId: string, change: CanonChange, actor: string): Promise<AppliedRevision>;
  regenerate(projectId: string, toVersion: string): Promise<void>;
}

export type EditOutcome = "applied" | "rejected" | "failed" | "skipped";

export async function processEditRequest(req: EditRequestRow, deps: EditDeps): Promise<EditOutcome> {
  if (!(await deps.claim(req.id))) return "skipped"; // another worker took it
  const parsed = CanonChangeSchema.safeParse(req.change);
  if (!parsed.success) {
    await deps.finish(req.id, { status: "failed", error: `invalid change: ${parsed.error.issues.map((i) => `${i.path.join(".") || "change"} ${i.message}`).join("; ")}`.slice(0, 1000) });
    return "failed";
  }
  try {
    const r = await deps.apply(req.projectId, parsed.data as CanonChange, `user:${req.requestedBy ?? "unknown"}`);
    if (r.outcome === "rejected") {
      await deps.finish(req.id, { status: "rejected", issues: r.issues, affectedShots: 0, toVersion: r.toVersion });
      return "rejected";
    }
    if (r.invalidatedShotIds.length) await deps.regenerate(req.projectId, r.toVersion);
    await deps.finish(req.id, { status: "applied", issues: [], affectedShots: r.invalidatedShotIds.length, toVersion: r.toVersion });
    return "applied";
  } catch (e) {
    await deps.finish(req.id, { status: "failed", error: (e instanceof Error ? e.message : String(e)).slice(0, 1000) });
    return "failed";
  }
}
