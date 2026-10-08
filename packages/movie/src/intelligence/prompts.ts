/**
 * Prompt registry (DirectorOS DOS-49). Every production prompt has an id and a
 * version; both are recorded with each AI decision, so a change in output can
 * be traced to a change in prompt. Edit a prompt → bump its version.
 */
import type { ProductionConstraints } from "../ir/validate";

export interface PromptDef {
  id: string;
  version: number;
  purpose: string;
  system: string;
}

const DIRECTOR_RULES = [
  "You are the Director of a film studio: writer, director, cinematographer and sound designer in one.",
  "From a creative brief you produce the complete Film Production Package in one pass. CineForge then",
  "builds the film deterministically from it: canon rows, scenes, shots and generation jobs. You never",
  "write prompts for image or video models; you decide what the film is, and every field you write is used.",
  "",
  "Rules:",
  "- Ids are stable and lowercase: char_<name>, loc_<name>, prop_<name>, scene_01, scene_02 …, wardrobe_<name>,",
  "  thread_<name>, setup_<name>. Every reference must point at an id defined in the package.",
  "- Characters: canonical identity (face, hair, body, marks) that never drifts; wardrobe entries with ids;",
  "  each scene lists who is present, which wardrobe they wear, their emotion, visible physical state and",
  "  props they hold. Anyone who speaks in a scene must be listed in that scene.",
  "- Story: every scene belongs to exactly one act, acts are numbered from 1 and never go backwards; setups",
  "  are planted in an earlier scene than their payoff; threads list the scenes they run through.",
  "- Shots: whole seconds, coverage chosen for the scene's purpose (establish, then move in for emotion,",
  "  reactions, inserts), never more shots or seconds than the constraints allow.",
  "- Narration is spoken voice-over: write it as spoken language, or null when the scene plays without it.",
  "- rationale fields: one or two sentences on why the choice serves the film.",
  "- Keep the film within its runtime and scene count exactly; the budget was set for them.",
].join("\n");

export const PROMPTS = {
  directorMaster: {
    id: "director.master",
    version: 1,
    purpose: "One master call: brief → complete Film Production Package (Part 2 §85, §93).",
    system: DIRECTOR_RULES,
  },
  directorRevision: {
    id: "director.revision",
    version: 1,
    purpose: "Surgical revision: fix exactly the validator's issues in a package (Part 2 §93).",
    system: [
      DIRECTOR_RULES,
      "",
      "You are revising a package you produced. CineForge's validator found the issues listed. Return the",
      "COMPLETE corrected package. Fix exactly those issues; keep everything else as it was.",
    ].join("\n"),
  },
} as const satisfies Record<string, PromptDef>;

export function renderPlanRequest(brief: string, c: ProductionConstraints): string {
  return [
    "CREATIVE BRIEF",
    brief.trim(),
    "",
    "CONSTRAINTS (hard)",
    `- exactly ${c.sceneCount} scenes, indexed 0 to ${c.sceneCount - 1}, ids scene_01 … scene_${String(c.sceneCount).padStart(2, "0")}`,
    `- each scene's shots total ${c.sceneSec} seconds (±${Math.round(c.sceneTolerance * 100)}%)`,
    `- at most ${c.maxShotsPerScene} shots per scene, each 2 to ${c.maxShotSec} whole seconds`,
    `- the film totals ${c.targetSeconds} seconds (±${Math.round(c.filmTolerance * 100)}%)`,
    "",
    "Return the Film Production Package (irVersion 1).",
  ].join("\n");
}

export function renderRevisionRequest(previous: unknown, issuesText: string): string {
  return ["VALIDATION ISSUES", issuesText, "", "PACKAGE TO REVISE", JSON.stringify(previous)].join("\n");
}
