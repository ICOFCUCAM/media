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
  kind: "location" | "prop" | "style";
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

/**
 * The film's look as one still (W24; Part 1 §34 "style reference"): palette,
 * light, lenses and texture in a representative frame of the film's world,
 * with no characters. Keyed by the look, so a new look draws a new still.
 */
export function styleReferenceSpec(pkg: FilmPackage): WorldReferenceSpec {
  const look = pkg.film.visualStyle;
  const place = pkg.locations[0];
  const canon = { look, genre: pkg.film.genre, tone: pkg.film.tone, era: pkg.film.era ?? null, place: place?.description ?? null };
  const prompt = [
    `Style frame, a single cinematic still that defines the look of a ${pkg.film.genre} film (${pkg.film.tone}); no people, no text.`,
    place ? `It shows ${place.name}: ${place.description}.` : null,
    `Palette: ${look.palette}. Lighting: ${look.lighting}. Lenses and framing: ${look.lensLanguage}. Texture: ${look.texture}.`,
    pkg.film.era ? `Era: ${pkg.film.era}.` : null,
  ].filter(Boolean).join(" ");
  return { kind: "style", id: "style_film", digest: digest(canon), prompt };
}
