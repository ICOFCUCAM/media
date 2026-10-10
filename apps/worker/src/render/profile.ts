import { prisma } from "@cineforge/db";
import { mixSpec, syncPolicy } from "@cineforge/shared";
import { judgeMaster, qualityMode } from "../quality/gates";
import { measureMedia } from "../quality/measure";
import { adSourceOf } from "@cineforge/movie";
import { loadBrandAssets, logoOf, outroFor, type BrandDb, type OutroCard } from "../canon/brand-refs";

/**
 * The production profile the master is mixed and judged by (W16): its sync
 * policy's delivery spec (loudness, true peak) and its mix spec (stem levels,
 * ducking). RENDER_SYNC_PROFILE, else RUNTIME_SYNC_PROFILE, else cinematic.
 */
export function renderProfile(env: NodeJS.ProcessEnv = process.env) {
  const policy = syncPolicy(env.RENDER_SYNC_PROFILE?.trim() || env.RUNTIME_SYNC_PROFILE?.trim() || "cinematic");
  return { policy, mix: mixSpec(policy), delivery: { integratedLufs: policy.delivery.integratedLufs, truePeakDbtp: policy.delivery.truePeakDbtp } };
}

/** Final Quality Gate (W5): measure the local master with ffmpeg and judge it against the profile's delivery spec. */
export const masterGate = (filmSec: number, delivery: { integratedLufs: number; truePeakDbtp: number }) => async (path: string, ctx: { hasSound: boolean; filmSec: number | undefined }) =>
  judgeMaster(await measureMedia(path, { loudness: true }),
    { durationSec: ctx.filmSec ?? filmSec, hasSound: ctx.hasSound, integratedLufs: delivery.integratedLufs, truePeakMaxDbtp: delivery.truePeakDbtp, sampleRate: 48_000 }, qualityMode());

/**
 * The closing card. White-label outro (docs/33): AGENCY+ (and admins) get their
 * brand kit; undefined otherwise. An advert from the Ads Studio (A3, docs/47)
 * closes on the advertiser's own logo, exactly as supplied, on any plan — with
 * its page's call to action as the line. A logo that cannot be fetched or drawn
 * is recorded by the render engine (BRAND_OUTRO_SKIPPED).
 */
export async function brandOutro(projectId: string): Promise<OutroCard | undefined> {
  const owner = await prisma.project.findUnique({
    where: { id: projectId },
    select: { userId: true, kind: true, adSource: true, user: { select: { tier: true, role: true } } },
  });
  const branded = owner && (owner.user.role === "ADMIN" || owner.user.tier === "AGENCY" || owner.user.tier === "ENTERPRISE");
  const kit = branded ? await prisma.brandKit.findUnique({ where: { userId: owner!.userId } }) : null;
  const logo = owner?.kind === "advert" ? logoOf(await loadBrandAssets(prisma as unknown as BrandDb, projectId)) : null;
  const cta = adSourceOf(owner?.adSource)?.facts.find((f) => f.kind === "call_to_action")?.quote ?? null;
  return outroFor(kit ? { logoKey: kit.logoKey, primaryColor: kit.primaryColor, outroText: kit.outroText } : null, logo, cta);
}
