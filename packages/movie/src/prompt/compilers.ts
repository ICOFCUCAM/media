/**
 * Model-specific prompt compilers (DirectorOS Part 1 §13; W4).
 *
 * One canonical request, translated for each engine the registry runs. Each
 * compiler knows its model's limits (prompt length, negative prompts, whether
 * it renders motion, whether camera moves can be described) and reports what
 * it had to leave out instead of silently dropping it.
 *
 *   wan-2.1       natural-language video prompt: subject + action first,
 *                 then place, light, camera move, look; English negative prompt
 *   hunyuan       the same order, denser camera vocabulary
 *   openai-image  a still (seed frame) in the structure OpenAI recommends:
 *                 scene, subject, details, constraints, intended use; no motion
 *   default       any other registered video model (external providers)
 *
 * Image models such as Flux/SDXL and ComfyUI workflows are added here when the
 * image runtime lands (W6); TTS / music / SFX compilers come with the Voice
 * Engine (W7) — the canonical request already carries the scene's sound.
 */
import { createHash } from "node:crypto";
import { sizeWords, type CanonicalMediaRequest } from "./canonical";

export interface ModelProfile {
  id: string;
  still: boolean;
  maxPromptChars: number;
  negativePrompt: boolean;
  /** Can the prompt usefully describe camera motion? */
  cameraMotion: boolean;
}

export const MODEL_PROFILES: Record<string, ModelProfile> = {
  "wan-2.1": { id: "wan-2.1", still: false, maxPromptChars: 1200, negativePrompt: true, cameraMotion: true },
  hunyuan: { id: "hunyuan", still: false, maxPromptChars: 1500, negativePrompt: true, cameraMotion: true },
  "openai-image": { id: "openai-image", still: true, maxPromptChars: 3800, negativePrompt: false, cameraMotion: false },
  default: { id: "default", still: false, maxPromptChars: 1000, negativePrompt: false, cameraMotion: true },
};

export const VIDEO_NEGATIVE = "blurry, low quality, watermark, text, subtitles, logo, extra limbs, deformed hands, duplicate faces, morphing face, flicker, jump cut within the shot";

export interface CompiledModelPrompt {
  modelId: string;
  prompt: string;
  negativePrompt: string | null;
  /** What the model cannot take and was left out or shortened. */
  dropped: string[];
  /** sha256 of the compiled request (prompt, negative prompt, model) — the cache key's prompt hash. */
  hash: string;
}

const MOVES: Record<string, { wan: string; hunyuan: string }> = {
  static: { wan: "the camera holds still", hunyuan: "locked-off static camera" },
  pan: { wan: "the camera pans slowly", hunyuan: "slow horizontal pan" },
  tilt: { wan: "the camera tilts slowly", hunyuan: "slow vertical tilt" },
  dolly: { wan: "the camera slowly dollies in", hunyuan: "smooth dolly-in" },
  crane: { wan: "the camera rises on a crane", hunyuan: "crane up, revealing the space" },
  handheld: { wan: "handheld camera, subtle shake", hunyuan: "handheld, documentary energy" },
  drone: { wan: "aerial drone shot gliding forward", hunyuan: "aerial drone glide" },
  tracking: { wan: "the camera tracks alongside the subject", hunyuan: "lateral tracking shot following the subject" },
};
const ANGLES: Record<string, string> = { eye: "eye-level", low: "low angle", high: "high angle", dutch: "dutch angle", overhead: "overhead top-down" };

function who(req: CanonicalMediaRequest, motion = false): string[] {
  return req.visualIntent.subjects.map((s) =>
    s.kind === "character"
      ? `${s.name}, ${s.look}${s.holding.length ? `, holding ${s.holding.join(" and ")}` : ""}${motion && s.movement ? `, moving ${s.movement}` : ""}`
      : `${s.name} (${s.look})`);
}

function fit(parts: string[], max: number, dropped: string[]): string {
  // Parts are in priority order; drop from the end until it fits, then clip.
  const kept = [...parts];
  while (kept.join(" ").length > max && kept.length > 1) dropped.push(`prompt part: ${kept.pop()!.slice(0, 40)}…`);
  let text = kept.join(" ");
  if (text.length > max) {
    dropped.push(`clipped to ${max} chars`);
    text = `${text.slice(0, max - 1).trimEnd()}…`;
  }
  return text;
}

function video(req: CanonicalMediaRequest, p: ModelProfile, flavour: "wan" | "hunyuan", dropped: string[]): string {
  const e = req.environment;
  const c = req.camera;
  const subjects = who(req, true);
  const move = MOVES[c.movement]?.[flavour] ?? c.movement;
  const facing = c.screenDirection ? `, facing screen ${c.screenDirection}` : "";
  return fit([
    `${subjects.length ? subjects.join("; ") + ". " : ""}${req.visualIntent.action}${req.visualIntent.emotion ? `, ${req.visualIntent.emotion}` : ""}${facing}.`,
    `${e.location}: ${e.description}, ${e.timeOfDay}${e.flashback ? ", remembered as a flashback" : ""}.`,
    `${sizeWords(c.size)}, ${ANGLES[c.angle] ?? c.angle}${c.lens ? `, ${c.lens} lens` : ""}; ${move}.`,
    `Lighting: ${e.lighting}.`,
    req.style.render
      ? `Look: ${req.style.render.look}; ${req.style.palette}; ${req.style.render.motion}.`
      : `Look: ${req.style.palette}; ${req.style.texture}; cinematic film.`,
  ], p.maxPromptChars, dropped);
}

function still(req: CanonicalMediaRequest, p: ModelProfile, dropped: string[]): string {
  const e = req.environment;
  const c = req.camera;
  if (c.movement !== "static") dropped.push(`camera movement (${c.movement}) — a still has none`);
  return fit([
    `Scene: ${e.location} — ${e.description}, ${e.timeOfDay}. Lighting: ${e.lighting}.`,
    `Subject: ${who(req).join("; ") || "the setting itself"}.`,
    `Action and mood: ${req.visualIntent.action}${req.visualIntent.emotion ? `; ${req.visualIntent.emotion}` : ""}.`,
    `Framing: ${sizeWords(c.size)}, ${ANGLES[c.angle] ?? c.angle}${c.lens ? `, ${c.lens} lens look` : ""}${c.screenDirection ? `, subject facing screen ${c.screenDirection}` : ""}.`,
    req.style.render
      ? `Style: ${req.style.render.look}; ${req.style.palette}. Not a photograph.`
      : `Style: photorealistic cinematic film still; ${req.style.palette}; ${req.style.texture}.`,
    `Constraints: keep every listed face, hairstyle, mark and garment exactly as described; no text, captions, watermarks or logos.`,
    `Intended use: the first frame of a ${req.durationSec}-second film shot.`,
  ], p.maxPromptChars, dropped);
}

export function compileFor(modelId: string, req: CanonicalMediaRequest): CompiledModelPrompt {
  const profile = MODEL_PROFILES[modelId] ?? { ...MODEL_PROFILES.default!, id: modelId };
  const dropped: string[] = [];
  const prompt = profile.still
    ? still(req, profile, dropped)
    : video(req, profile, modelId === "hunyuan" ? "hunyuan" : "wan", dropped);
  if (!profile.cameraMotion && !profile.still && req.camera.movement !== "static") dropped.push(`camera movement (${req.camera.movement})`);
  const negativePrompt = profile.negativePrompt ? (req.style.render ? `${VIDEO_NEGATIVE}, ${req.style.render.avoid}` : VIDEO_NEGATIVE) : null;
  if (!profile.negativePrompt && !profile.still) dropped.push("negative prompt (not supported)");
  const hash = createHash("sha256").update(JSON.stringify([modelId, prompt, negativePrompt])).digest("hex");
  return { modelId, prompt, negativePrompt, dropped, hash };
}
