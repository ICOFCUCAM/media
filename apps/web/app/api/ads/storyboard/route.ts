/**
 * Ads Studio — write the storyboard (W32; docs/47 §8). POST the studio's
 * inputs (brief, length, creative direction, voice, and — when the page was
 * analysed — its facts and brand); the Ads Studio writer returns the advert's
 * beats with their visual direction and lines. No model is called and nothing
 * is stored: the owner edits the storyboard on the page before producing it.
 */
import { advertStoryboard, BEAT_LABEL, storyboardIssues } from "@cineforge/movie";
import { json, readBrief } from "../../../../lib/ads-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const b = readBrief(body);
  if ("error" in b) return json(400, { error: b.error });
  const scenes = advertStoryboard(b.brief);
  return json(200, { scenes, labels: BEAT_LABEL, issues: storyboardIssues(scenes, b.brief.seconds, b.brief.voice) });
}
