/**
 * Location and prop reference stills (DirectorOS Part 1 §34–35; W17). Like the
 * wardrobe references: one still per place or prop, keyed by a digest of
 * exactly the canon it depicts, so a change to the place or the prop — or to
 * the film's look — yields a new digest and a new still, while unchanged canon
 * reuses the one already drawn. The still shows the canon, not a moment: a
 * place empty of people in its own light, a prop alone on a plain ground.
 */
import { createHash } from "node:crypto";
import type { FilmPackage } from "../ir/schema";

export interface WorldReferenceSpec {
  kind: "location" | "prop";
  id: string;
  digest: string;
  prompt: string;
}

export class WorldReferenceError extends Error {}

const digest = (o: unknown) => createHash("sha256").update(JSON.stringify(o)).digest("hex");

export function locationReferenceSpec(pkg: FilmPackage, locationId: string): WorldReferenceSpec {
  const l = pkg.locations.find((x) => x.id === locationId);
  if (!l) throw new WorldReferenceError(`location ${locationId} is not in the plan`);
  const look = pkg.film.visualStyle;
  const canon = { name: l.name, kind: l.kind, description: l.description, architecture: l.architecture, era: l.era, lighting: l.lighting, palette: look.palette, texture: look.texture };
  const prompt = [
    `Location reference, wide establishing view, no people, no text.`,
    `${l.name} (${l.kind.toLowerCase()}): ${l.description}.`,
    `Architecture: ${l.architecture}. Era: ${l.era}. Light: ${l.lighting}.`,
    `Film look: ${look.palette}; ${look.texture}.`,
  ].join(" ");
  return { kind: "location", id: locationId, digest: digest(canon), prompt };
}

export function propReferenceSpec(pkg: FilmPackage, propId: string): WorldReferenceSpec {
  const p = pkg.props.find((x) => x.id === propId);
  if (!p) throw new WorldReferenceError(`prop ${propId} is not in the plan`);
  const look = pkg.film.visualStyle;
  const canon = { name: p.name, description: p.description, palette: look.palette, texture: look.texture };
  const prompt = [
    `Prop reference, the object alone, centred on a plain neutral background, even soft light, no hands, no text.`,
    `${p.name}: ${p.description}.`,
    `Film look: ${look.palette}; ${look.texture}.`,
  ].join(" ");
  return { kind: "prop", id: propId, digest: digest(canon), prompt };
}
