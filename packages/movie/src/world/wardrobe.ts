/**
 * Wardrobe reference pack (DirectorOS Part 2 §62.9 "new reference pack
 * generated"; W3 follow-up).
 *
 * One reference still per (character, wardrobe entry): the character's
 * canonical identity wearing that wardrobe, in the film's look. It is keyed by
 * a digest of exactly the canon it depicts, so a change to the identity, the
 * wardrobe description or the film's look yields a new digest — and therefore
 * a new reference — while unchanged canon reuses the existing image.
 */
import { createHash } from "node:crypto";
import type { FilmPackage } from "../ir/schema";

export interface WardrobeReferenceSpec {
  characterId: string;
  wardrobeId: string;
  /** sha256 of the canon the image depicts. */
  digest: string;
  prompt: string;
}

export class WardrobeReferenceError extends Error {}

export function wardrobeReferenceSpec(pkg: FilmPackage, characterId: string, wardrobeId: string): WardrobeReferenceSpec {
  const c = pkg.cast.find((x) => x.id === characterId);
  if (!c) throw new WardrobeReferenceError(`character ${characterId} is not in the cast`);
  const w = c.wardrobe.find((x) => x.id === wardrobeId);
  if (!w) throw new WardrobeReferenceError(`${wardrobeId} is not one of ${characterId}'s wardrobe entries`);
  const look = pkg.film.visualStyle;
  const canon = { identity: c.identity, age: c.age, gender: c.gender, wardrobe: w.description, palette: look.palette, texture: look.texture };
  const marks = c.identity.marks.length ? ` Always visible: ${c.identity.marks.join(", ")}.` : "";
  const prompt = [
    `Full-body character reference, front three-quarter view, neutral studio background, even soft light.`,
    `${c.name}${c.age !== null ? `, age ${c.age}` : ""}${c.gender ? `, ${c.gender}` : ""}: ${c.identity.face}; ${c.identity.hair}; ${c.identity.body}.${marks}`,
    `Wearing ${w.description}.`,
    `Film look: ${look.palette}; ${look.texture}. No text, no watermark.`,
  ].join(" ");
  return { characterId, wardrobeId, digest: createHash("sha256").update(JSON.stringify(canon)).digest("hex"), prompt };
}
