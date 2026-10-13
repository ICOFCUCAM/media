/**
 * Ads Studio — produce the advert (W32; docs/47 §8). POST the studio's inputs,
 * the (edited) storyboard, the output formats, the analysed page (optional)
 * and the brand files already uploaded to the owner's folder. For each format
 * the route writes the advert's full plan (advertPackage), checks it with the
 * Director's own validators, and creates one advert project as the signed-in
 * user (RLS applies) carrying the plan (supplied_plan, docs/76), the page's
 * facts (ad_source) and the brand files (brand_assets). The worker then makes
 * the stills, the video, the voice-over, the music and sound, and renders the
 * film with the logo card — without a Director call.
 */
import { advertConstraints, advertPackage, storyboardIssues, validateFilmPackage, type AdAspect, type AdvertBrief } from "@cineforge/movie";
import { ASPECTS, asUser, json, readBrief, readScenes, str } from "../../../../lib/ads-server";
import { estimateMs } from "../../../../lib/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BrandFile { role: "logo" | "product"; storageKey: string; name: string; mime: string; bytes: number }

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return json(503, { error: "Sign-in is not configured on this deployment." });
  const me = await asUser(req);
  if (!me) return json(401, { error: "Sign in to CineForge to produce the ad." });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const b = readBrief(body);
  if ("error" in b) return json(400, { error: b.error });
  const scenes = readScenes(body?.scenes);
  const issues = storyboardIssues(scenes, b.brief.seconds, b.brief.voice);
  if (issues.length) return json(422, { error: issues[0], issues });
  const formats = ASPECTS.filter((a) => Array.isArray(body?.formats) && (body!.formats as unknown[]).includes(a));
  if (!formats.length) formats.push("16:9");
  const brandFiles = (Array.isArray(body?.brandFiles) ? body!.brandFiles : []).flatMap((f) => {
    const x = (f ?? {}) as Record<string, unknown>;
    const role = x.role === "logo" || x.role === "product" ? x.role : null;
    const storageKey = str(x.storageKey, 300);
    return role && storageKey.startsWith(`brand/${me.userId}/`) ? [{ role, storageKey, name: str(x.name, 200) || "file", mime: str(x.mime, 40), bytes: Number(x.bytes) || 0 } as BrandFile] : [];
  }).slice(0, 9);
  const brief: AdvertBrief = { ...b.brief, productPhotos: brandFiles.filter((f) => f.role === "product").length, logo: brandFiles.some((f) => f.role === "logo") };

  const pkg = advertPackage(brief, scenes);
  const v = validateFilmPackage(pkg, advertConstraints(brief.seconds));
  if (!v.ok) return json(422, { error: `The plan did not pass the checks: ${v.issues[0]?.message ?? "unknown"}`, issues: v.issues.slice(0, 20) });

  const src = (body?.source ?? null) as Record<string, unknown> | null;
  const adSource = brief.facts?.length || brief.url
    ? { url: brief.url, title: brief.title, brand: brief.brand, fetchedAt: str(src?.fetchedAt, 40) || null, facts: brief.facts ?? [] }
    : null;
  const title = str(body?.title, 120) || (brief.brand ? `${brief.brand} advert` : `Advert · ${(brief.brief || "untitled").slice(0, 40)}`);
  const prompt = str(body?.prompt, 4000) || brief.brief || title;
  const modelId = "wan-2.1";

  const created: { id: string; aspect: AdAspect }[] = [];
  for (const aspect of formats) {
    const { data, error } = await me.sb.from("projects").insert({
      user_id: me.userId,
      title: formats.length > 1 ? `${title} · ${aspect}` : title,
      prompt, target_seconds: brief.seconds, model_id: modelId, resolution: "720p", aspect_ratio: aspect,
      estimated_ms: estimateMs(modelId, brief.seconds), kind: "advert", medium: "live_action",
      ...(adSource ? { ad_source: adSource } : {}),
      supplied_plan: v.pkg, supplied_plan_by: "ads-studio",
      // With brand files the project waits as DRAFT until they are attached (the worker claims PLANNING).
      status: brandFiles.length ? "DRAFT" : "PLANNING", progress: 0,
    }).select("id").single();
    if (error || !data) return json(400, { error: `The ad could not be created: ${error?.message ?? "unknown"}`, created });
    const id = (data as { id: string }).id;
    if (brandFiles.length) {
      const { error: be } = await me.sb.from("brand_assets").insert(brandFiles.map((f) => ({
        project_id: id, user_id: me.userId, role: f.role, storage_key: f.storageKey, name: f.name, mime: f.mime, bytes: f.bytes,
      })));
      if (be) {
        await me.sb.from("projects").update({ status: "FAILED", error_message: `Brand files could not be attached: ${be.message}` }).eq("id", id);
        return json(400, { error: `Brand files could not be attached: ${be.message}`, created });
      }
      const { error: qe } = await me.sb.from("projects").update({ status: "PLANNING" }).eq("id", id);
      if (qe) return json(400, { error: qe.message, created });
    }
    created.push({ id, aspect });
  }
  console.log(JSON.stringify({ event: "ads.produce", userId: me.userId, projects: created.map((c) => c.id), seconds: brief.seconds, facts: brief.facts?.length ?? 0, brandFiles: brandFiles.length }));
  return json(200, { projects: created });
}
