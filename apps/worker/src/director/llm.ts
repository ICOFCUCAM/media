/**
 * Director AI — the real Anthropic-backed planner.
 *
 * Turns a creative brief into a structured production plan (logline, synopsis,
 * a visually-consistent protagonist + location, and a beat-by-beat scene list).
 * The plan's prose is what makes shot prompts bible-aware: every shot prompt the
 * pipeline builds (and every seed frame generated from it) inherits the
 * character appearance, location and scene beat the Director wrote here.
 *
 * Runs on Anthropic Claude (default `claude-opus-4-8`, override ANTHROPIC_MODEL).
 *
 * No fake completion (DirectorOS DOS-74/75): when ANTHROPIC_API_KEY is unset or
 * the call fails, planning FAILS with DIRECTOR_UNAVAILABLE — it never produces a
 * stand-in film. The deterministic stub exists only for local runs and tests,
 * behind DIRECTOR_ALLOW_STUB=1. A plan missing its essential content fails with
 * DIRECTOR_OUTPUT_INVALID instead of being padded with invented defaults.
 */
import Anthropic from "@anthropic-ai/sdk";
import { ProductionFailure, type SceneBridge, type StateFields } from "@cineforge/shared";

export const LOCATION_KINDS = ["CITY", "KINGDOM", "BUILDING", "ROOM", "LANDSCAPE", "INTERIOR", "EXTERIOR"] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

export interface SceneBeat {
  heading: string; // "EXT. THRONE ROOM - NIGHT"
  summary: string; // VISUAL: what the camera sees this scene (drives the shot prompt)
  narration: string; // SPOKEN: voiceover that tells the STORY this scene (drives TTS)
  timeOfDay: string; // "day" | "night" | ...
  // Continuity Engine (docs/28): the Director's own proposal for what this scene
  // changes + how it bridges to the next. Optional — falls back to autoContinuity.
  bridge?: SceneBridge;
  state?: StateFields;
}
export interface FilmDraft {
  logline: string;
  synopsis: string;
  genre: string;
  tone: string;
  location: { name: string; kind: LocationKind; description: string };
  protagonist: { name: string; age: number | null; gender: string | null; appearance: string; personality: string | null };
  scenes: SceneBeat[];
  raw: unknown;
  /** Presentation fields CineForge derived because the Director left them blank. */
  inferred: string[];
}

const SYSTEM = [
  "You are the Director — a master filmmaker and showrunner.",
  "Given a creative brief, produce a tight, production-ready plan: a logline, a",
  "one-paragraph synopsis, genre and tone, ONE primary protagonist with a vivid,",
  "specific physical appearance (so the look stays consistent across every shot),",
  "ONE primary location, and a beat-by-beat scene list.",
  "Keep the protagonist and location visually consistent so they never drift.",
  "Treat the film as ONE continuous story: each scene must inherit and advance the",
  "state of the ones before it. For every scene give a `bridge` to the next scene",
  "and the `state` it changes, so emotions, injuries, season and destroyed places",
  "carry forward and never silently contradict.",
  "Provide your plan by calling the submit_film_plan tool.",
].join(" ");

function userPrompt(brief: string, sceneCount: number): string {
  return [
    `Brief: ${brief}`,
    "",
    `Plan exactly ${sceneCount} scenes. Call submit_film_plan with these fields:`,
    "logline (string), synopsis (string), genre (string), tone (string),",
    'location { name (string), kind (one of CITY|KINGDOM|BUILDING|ROOM|LANDSCAPE|INTERIOR|EXTERIOR), description (string) },',
    "protagonist { name (string), age (number or null), gender (string or null), appearance (string), personality (string or null) },",
    `scenes (array of exactly ${sceneCount} objects), each:`,
    '{ heading (e.g. "EXT. OLD LAGOS - NIGHT"), summary (string), narration (string), timeOfDay (string),',
    "  — summary is the VISUAL: what the camera sees, used to render the picture.",
    "  — narration is the SPOKEN VOICEOVER that tells the STORY (what it MEANS, the stakes,",
    "    the emotion), as a narrator would say it over the footage — NOT a description of the",
    '    image. One or two vivid sentences. e.g. summary "a lone warrior on the palace steps at',
    '    dawn" -> narration "They said the kingdom would fall by sunrise. They had not met its last daughter."',
    "  bridge { whatJustHappened, whatChanged, whatCarriesForward, nextSceneRequirements } (all strings),",
    "  state { emotion, health, wardrobe, season, locationStatus, goal } (strings; the protagonist's emotion,",
    '  health and wardrobe/look after this scene, the world season, this scene\'s location status e.g.',
    '  "destroyed", and the protagonist\'s current goal — omit or leave empty when unchanged) }.',
  ].join("\n");
}

/** Pull the first balanced JSON object out of the model's reply, fences or not. */
function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Director: no JSON object in response");
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

const asKind = (v: unknown): LocationKind =>
  typeof v === "string" && (LOCATION_KINDS as readonly string[]).includes(v.toUpperCase())
    ? (v.toUpperCase() as LocationKind)
    : "EXTERIOR";
const str = (v: unknown, fallback = ""): string => (typeof v === "string" && v.trim() ? v : fallback);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Parse the Director's per-scene bridge; undefined if it gave us nothing usable. */
function parseBridge(v: unknown): SceneBridge | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const b: SceneBridge = {
    whatJustHappened: str(o.whatJustHappened),
    whatChanged: str(o.whatChanged),
    whatCarriesForward: str(o.whatCarriesForward),
    nextSceneRequirements: str(o.nextSceneRequirements),
  };
  return Object.values(b).some((x) => x) ? b : undefined;
}

/** Parse the Director's per-scene state changes; undefined if empty. */
function parseState(v: unknown): StateFields | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const s: StateFields = {
    emotion: strOrNull(o.emotion),
    health: strOrNull(o.health),
    season: strOrNull(o.season),
    locationStatus: strOrNull(o.locationStatus),
    goal: strOrNull(o.goal),
    wardrobe: strOrNull(o.wardrobe),
  };
  return Object.values(s).some(Boolean) ? s : undefined;
}

/**
 * JSON Schema for the Director's plan. Used as a tool `input_schema` so we force
 * Claude to emit the plan as a single structured tool call (`tool_choice: tool`)
 * — a hard schema guarantee, no JSON scraping. We still coerce defensively in
 * case a field is missing or off-type.
 */
const PLAN_TOOL = "submit_film_plan";
const bridgeProps = {
  type: "object",
  additionalProperties: false,
  properties: {
    whatJustHappened: { type: "string" },
    whatChanged: { type: "string" },
    whatCarriesForward: { type: "string" },
    nextSceneRequirements: { type: "string" },
  },
} as const;
const stateProps = {
  type: "object",
  additionalProperties: false,
  properties: {
    emotion: { type: "string" },
    health: { type: "string" },
    wardrobe: { type: "string" },
    season: { type: "string" },
    locationStatus: { type: "string" },
    goal: { type: "string" },
  },
} as const;
const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["logline", "synopsis", "genre", "tone", "location", "protagonist", "scenes"],
  properties: {
    logline: { type: "string" },
    synopsis: { type: "string" },
    genre: { type: "string" },
    tone: { type: "string" },
    location: {
      type: "object",
      additionalProperties: false,
      required: ["name", "kind", "description"],
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: LOCATION_KINDS as unknown as string[] },
        description: { type: "string" },
      },
    },
    protagonist: {
      type: "object",
      additionalProperties: false,
      required: ["name", "appearance"],
      properties: {
        name: { type: "string" },
        age: { type: ["integer", "null"] },
        gender: { type: ["string", "null"] },
        appearance: { type: "string" },
        personality: { type: ["string", "null"] },
      },
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "summary", "narration", "timeOfDay"],
        properties: {
          heading: { type: "string" },
          summary: { type: "string" },
          narration: { type: "string" },
          timeOfDay: { type: "string" },
          bridge: bridgeProps,
          state: stateProps,
        },
      },
    },
  },
} as const;

/**
 * Validate a raw plan object (tool call or extracted JSON) into a FilmDraft.
 *
 * Essential content must come from the Director: logline, the protagonist's
 * name and appearance, the location's name and description, and a summary for
 * every scene. Anything missing fails the plan (DOS-24: validate, don't pad).
 * Only presentation details with an obvious derivation are filled (genre/tone
 * labels, a heading built from the location, day/night alternation, empty
 * narration) and they are listed in `inferred`.
 */
export function coerceDraft(j: Record<string, unknown>, brief: string, sceneCount: number): FilmDraft {
  const loc = (j.location ?? {}) as Record<string, unknown>;
  const pro = (j.protagonist ?? {}) as Record<string, unknown>;
  const rawScenes = Array.isArray(j.scenes) ? (j.scenes as Record<string, unknown>[]) : [];
  const missing: string[] = [];
  const need = (v: unknown, path: string): string => {
    const t = typeof v === "string" ? v.trim() : "";
    if (!t) missing.push(path);
    return t;
  };
  const logline = need(j.logline, "logline");
  const proName = need(pro.name, "protagonist.name");
  const proLook = need(pro.appearance, "protagonist.appearance");
  const locName = need(loc.name, "location.name");
  const locDesc = need(loc.description, "location.description");
  if (rawScenes.length < sceneCount) missing.push(`scenes (${rawScenes.length}/${sceneCount})`);
  const inferred: string[] = [];
  const scenes: SceneBeat[] = Array.from({ length: sceneCount }, (_, i) => {
    const s = rawScenes[i] ?? {};
    const summary = need(s.summary, `scenes[${i}].summary`);
    let tod = typeof s.timeOfDay === "string" && s.timeOfDay.trim() ? s.timeOfDay.trim() : "";
    if (!tod) {
      tod = i % 2 ? "night" : "day";
      inferred.push(`scenes[${i}].timeOfDay`);
    }
    let heading = typeof s.heading === "string" ? s.heading.trim() : "";
    if (!heading) {
      heading = `EXT. ${(locName || "LOCATION").toUpperCase()} - ${tod.toUpperCase()}`;
      inferred.push(`scenes[${i}].heading`);
    }
    return {
      heading,
      summary,
      narration: str(s.narration, ""),
      timeOfDay: tod,
      bridge: parseBridge(s.bridge),
      state: parseState(s.state),
    };
  });
  if (missing.length) {
    throw new ProductionFailure("DIRECTOR_OUTPUT_INVALID", `the plan is missing ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? ", …" : ""}`, {
      missing,
    });
  }
  for (const k of ["genre", "tone", "synopsis"] as const) if (typeof j[k] !== "string" || !(j[k] as string).trim()) inferred.push(k);

  return {
    logline,
    synopsis: str(j.synopsis, brief),
    genre: str(j.genre, "drama"),
    tone: str(j.tone, "cinematic"),
    location: { name: locName, kind: asKind(loc.kind), description: locDesc },
    protagonist: {
      name: proName,
      age: numOrNull(pro.age),
      gender: strOrNull(pro.gender),
      appearance: proLook,
      personality: strOrNull(pro.personality),
    },
    scenes,
    raw: j,
    inferred,
  };
}

const stubAllowed = () => process.env.DIRECTOR_ALLOW_STUB === "1";

/** Plan a film with Claude. Fails (DIRECTOR_UNAVAILABLE) rather than inventing a film. */
export async function draftFilm(brief: string, sceneCount: number): Promise<FilmDraft> {
  if (!process.env.ANTHROPIC_API_KEY) {
    if (stubAllowed()) return stubDraft(brief, sceneCount);
    throw new ProductionFailure("DIRECTOR_UNAVAILABLE", "no planning model is configured (ANTHROPIC_API_KEY)");
  }
  let j: Record<string, unknown>;
  try {
    const client = new Anthropic(); // reads ANTHROPIC_API_KEY
    // Force the plan through a tool's input_schema (structured output). Reading
    // tool_use.input gives us a schema-shaped object directly; if the model
    // returns text instead, fall back to extracting JSON from it.
    const res = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8",
      max_tokens: 16000,
      system: SYSTEM,
      tools: [{ name: PLAN_TOOL, description: "Return the complete film plan.", input_schema: PLAN_SCHEMA as unknown as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: PLAN_TOOL },
      messages: [{ role: "user", content: userPrompt(brief, sceneCount) }],
    });

    const toolUse = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === PLAN_TOOL);
    if (toolUse && toolUse.input && typeof toolUse.input === "object") {
      j = toolUse.input as Record<string, unknown>;
    } else {
      const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      if (!text) throw new Error("Director: no tool_use or text block in response");
      j = extractJson(text.text);
    }
  } catch (err) {
    // The SDK has already retried transient errors. Report, never substitute.
    console.error(JSON.stringify({ event: "director.unavailable", error: err instanceof Error ? err.message : String(err) }));
    if (stubAllowed()) return stubDraft(brief, sceneCount);
    throw new ProductionFailure("DIRECTOR_UNAVAILABLE", "the planning model could not be reached", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return coerceDraft(j, brief, sceneCount);
}

/** Deterministic stand-in plan — local runs and tests only (DIRECTOR_ALLOW_STUB=1). */
function stubDraft(brief: string, sceneCount: number): FilmDraft {
  const title = brief.slice(0, 60);
  return {
    logline: `A story generated from: ${title}`,
    synopsis: `An auto-generated synopsis for "${title}", told across ${sceneCount} scenes.`,
    genre: "drama",
    tone: "cinematic",
    location: { name: "The Kingdom", kind: "EXTERIOR", description: "a vast sunlit African kingdom of red earth and stone" },
    protagonist: {
      name: "Adisa",
      age: null,
      gender: null,
      appearance: "a regal warrior, dark skin, gold-threaded robes, close-cropped hair",
      personality: null,
    },
    scenes: Array.from({ length: sceneCount }, (_, i) => ({
      heading: `EXT. THE KINGDOM - ${i % 2 ? "NIGHT" : "DAY"}`,
      summary: `Beat ${i + 1}: the conflict deepens toward independence.`,
      narration: `And so the kingdom's struggle for freedom deepened.`,
      timeOfDay: i % 2 ? "night" : "day",
    })),
    raw: { brief, stub: true },
    inferred: ["*"],
  };
}
