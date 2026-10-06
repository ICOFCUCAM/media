#!/usr/bin/env node
/*
 * Generate the homepage's cinematic frames with CineForge's image engine
 * (OpenAI gpt-image-1 — the same model the worker uses for seed frames).
 *
 *   OPENAI_API_KEY=sk-... node apps/web/scripts/generate-frames.mjs          # all missing slots
 *   OPENAI_API_KEY=sk-... node apps/web/scripts/generate-frames.mjs hero     # one slot (overwrites)
 *
 * Writes apps/web/public/frames/<slot>.webp. Commit the files you like; the
 * homepage picks each one up automatically and falls back to its drawn
 * illustration for any slot that is missing (lib/frames.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "frames");
const STYLE =
  "Photorealistic cinematic film still, shot on ARRI Alexa 65 with anamorphic lenses, natural film grain, motivated practical light, rich shadow detail, filmic color grade, no text, no captions, no logos, no watermark.";

/** Slot → [size, prompt]. The hero must be the most spectacular frame on the site. */
const SLOTS = {
  hero: [
    "1536x1024",
    "Epic ultra-wide establishing shot at dawn of Ashéron-Kor: a colossal Sudano-Sahelian citadel of tapered mud-brick towers bristling with wooden toron beams rises on a terraced hill above a lantern-lit town and a winding river; its central spire carries a thin floating ring of golden light, and two small sleek aircraft cross the sky. In the foreground on a grassy ridge, seen from behind, a West African queen in an indigo-and-gold gele and a wind-blown crimson cape holds a tall staff, flanked by guards with spears and hide shields and a red war banner. Low sun directly behind the spire, volumetric god rays, dust in the backlight, layered atmospheric haze, amber and deep violet palette, immense scale.",
  ],
  world: [
    "1024x1536",
    "High aerial establishing shot at dusk over a vast fictional African realm: a river delta braids through red dunes toward a dark coastline, highland forest and terraced mountains to the north, a distant citadel glowing on a hill, caravans as tiny lights along a salt road. Matte-painting scale with photographic realism, cool blue shadows and warm last light.",
  ],
  story: [
    "1024x1536",
    "Intimate close-up in profile of a young West African woman in a sculpted burnt-orange gele and gold hoop earring, determined expression, eyes catching firelight; warm firelight rim light from the right, teal night ambience behind, shallow depth of field with large soft bokeh, 85mm lens.",
  ],
  voice: [
    "1536x1024",
    "Behind-the-scenes photograph in a recording booth: a Black woman with locs wearing studio headphones performs a narration line with eyes closed in front of a large-diaphragm microphone and pop filter, a ring light glowing behind her, acoustic foam walls, moody violet ambience with a warm key light on her face, documentary realism, 50mm lens.",
  ],
  "work-1": ["1536x1024", "Night interior of an ancient throne hall lit by torches, a king seated in shadow, courtiers in rich textiles, smoke catching the light — feature drama."],
  "work-2": ["1536x1024", "Misty highland forest at blue hour with giant moss-covered trees and faint bioluminescent flowers, a lone traveller with a lantern on a stone path — fantasy world."],
  "work-3": ["1536x1024", "Golden-hour Sahel savannah, herders walking long-horned cattle past acacia trees, dust in the low sun — documentary realism."],
  "work-4": ["1536x1024", "Premium commercial product still: matte black wireless earbuds on wet black stone, a single hard rim light and soft reflections, droplets in focus — brand film."],
  "work-5": ["1536x1024", "Rain-soaked neon city street at night, a dancer mid-spin under a magenta sign, reflections in puddles, shallow depth of field — vertical short."],
  "work-6": ["1536x1024", "Concert stage at night, a singer silhouetted in a single white spotlight, haze with crossing beams, crowd hands in the foreground — music video."],
};

async function generate(slot) {
  const [size, prompt] = SLOTS[slot];
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1", prompt: `${prompt} ${STYLE}`, size, quality: "high", output_format: "webp", output_compression: 82, n: 1 }),
  });
  if (!res.ok) throw new Error(`${slot}: ${res.status} ${await res.text()}`);
  const { data } = await res.json();
  fs.writeFileSync(path.join(OUT, `${slot}.webp`), Buffer.from(data[0].b64_json, "base64"));
  console.log(`✓ ${slot}.webp`);
}

if (!process.env.OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY (the same key the worker uses for seed frames).");
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
const wanted = process.argv.slice(2);
const slots = wanted.length ? wanted : Object.keys(SLOTS).filter((s) => !fs.existsSync(path.join(OUT, `${s}.webp`)));
for (const s of slots) {
  if (!SLOTS[s]) throw new Error(`Unknown slot "${s}". Slots: ${Object.keys(SLOTS).join(", ")}`);
  await generate(s);
}
if (slots.length === 0) console.log("All frames exist — pass a slot name to regenerate one.");
