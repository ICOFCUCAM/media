/**
 * Character Card portraits (DirectorOS W21; Part 5 §183, migration 0054). An
 * owner asks for a portrait on a card; the poller claims the request and the
 * image engine draws it from the card itself — look, hair, eyes, clothing,
 * the animated design and style — recorded in the image ledger like every
 * other still. The worker writes the key; clients can only ask (0054).
 */
import { imageGenerationRow, recordImageGeneration, type ImageLedgerDb } from "./ledger";
import type { ImageProvider } from "./providers";

export interface PortraitCard {
  id: string;
  projectId: string;
  name: string;
  appearance: string;
  age: number | null;
  heightCm: number | null;
  hair: string | null;
  eyes: string | null;
  clothing: string | null;
  animationStyle: string | null;
  design: unknown;
}

/** The portrait prompt, from the card (pure). */
export function portraitPrompt(c: PortraitCard): string {
  const d = (c.design ?? null) as { proportions?: string; palette?: string } | null;
  const style = c.animationStyle ? `${c.animationStyle.replace(/_/g, " ")} animation style character design` : "photorealistic cinematic portrait";
  return [
    `Character portrait of ${c.name}: ${c.appearance}.`,
    c.age != null ? `Age ${c.age}.` : null,
    c.heightCm != null ? `${c.heightCm} cm tall.` : null,
    c.hair ? `Hair: ${c.hair}.` : null,
    c.eyes ? `Eyes: ${c.eyes}.` : null,
    c.clothing ? `Wearing ${c.clothing}.` : null,
    d?.proportions ? `Proportions: ${d.proportions}.` : null,
    d?.palette ? `Exact colours: ${d.palette}.` : null,
    `Three-quarter view, head and shoulders to mid-body, plain neutral background, even soft light; ${style}.`,
    "One character only; no text, no captions, no watermark.",
  ].filter(Boolean).join(" ").slice(0, 1800);
}

export interface PortraitDb extends ImageLedgerDb {
  character: {
    findMany(a: unknown): Promise<PortraitCard[]>;
    updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  };
}

/** One poller tick: draw the requested portraits (a few at a time). */
export async function drawPortraits(db: PortraitDb, provider: ImageProvider | null, now = Date.now()): Promise<{ drawn: number; failed: number }> {
  const asked = await db.character.findMany({
    where: { portraitStatus: "requested" }, take: 3,
    select: { id: true, projectId: true, name: true, appearance: true, age: true, heightCm: true, hair: true, eyes: true, clothing: true, animationStyle: true, design: true },
  });
  let drawn = 0;
  let failed = 0;
  for (const c of asked) {
    const claimed = await db.character.updateMany({ where: { id: c.id, portraitStatus: "requested" }, data: { portraitStatus: "generating", portraitError: null } });
    if (claimed.count !== 1) continue;
    if (!provider) {
      await db.character.updateMany({ where: { id: c.id }, data: { portraitStatus: "failed", portraitError: "No image provider is configured." } });
      failed++;
      continue;
    }
    try {
      const img = await provider.generate(portraitPrompt(c), `projects/${c.projectId}/characters/${c.id}/portrait-${now}.png`, { width: 1024, height: 1024 });
      await recordImageGeneration(db, imageGenerationRow(c.projectId, "portrait", c.id, img));
      await db.character.updateMany({ where: { id: c.id }, data: { portraitStatus: "ready", portraitKey: img.key, portraitError: null } });
      drawn++;
    } catch (e) {
      await db.character.updateMany({ where: { id: c.id }, data: { portraitStatus: "failed", portraitError: (e instanceof Error ? e.message : String(e)).slice(0, 300) } });
      failed++;
    }
  }
  return { drawn, failed };
}
