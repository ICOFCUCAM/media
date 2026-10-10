/**
 * The directorial roles (DirectorOS Part 1 §26–28). §27 says not to create
 * twenty agents — they bring conflicting decisions, context explosion, cost
 * and unpredictability — and to start with six, controlled by the Director so
 * the user never manages them. Part 2 §85 then puts story, cinematography and
 * audio planning into ONE master call (one-pass intelligence). So a role here
 * is a responsibility, carried by prompts (model calls, each logged with its
 * why) and deterministic engines (code that checks or compiles), not a
 * free-running agent. Since W24 the Cinematographer also has its own call: it
 * redesigns the coverage of a scene with grammar problems from that scene's
 * state only (./coverage.ts), and its answer is kept only when it validates.
 * No role depends on a vendor's multi-agent feature
 * (§26.2: an optimisation, never the architecture).
 */
import { PROMPTS } from "./prompts";

export interface DirectorialRole {
  id: "director" | "story" | "visual" | "audio" | "continuity" | "editor_qc";
  label: string;
  /** What it decides or guarantees. */
  owns: string[];
  /** Prompt ids that carry it (model calls). */
  prompts: string[];
  /** Deterministic engines that carry it (module paths in this repository). */
  engines: string[];
}

export const DIRECTORIAL_ROLES: DirectorialRole[] = [
  {
    id: "director", label: "Director",
    owns: ["the whole film in one master plan", "answering the owner's instructions", "deciding which role handles a request"],
    prompts: [PROMPTS.directorMaster.id, PROMPTS.directorRevision.id, PROMPTS.directorEdit.id],
    engines: ["packages/movie/src/intelligence/planner.ts", "apps/worker/src/canon/conversation.ts"],
  },
  {
    id: "story", label: "Story / Screenplay",
    owns: ["acts, scenes, threads, setups and payoffs", "facts and who knows them", "dialogue and narration"],
    prompts: [PROMPTS.translateLines.id],
    engines: ["packages/movie/src/ir/validate.ts (story, canon)", "packages/movie/src/world/state.ts"],
  },
  {
    id: "visual", label: "Visual / Cinematography",
    owns: ["coverage, shot sizes, camera, the 180° line", "prompts for image and video models", "the production's look"],
    prompts: [PROMPTS.cinemaDesign.id],
    engines: ["packages/movie/src/cinema/engine.ts", "packages/movie/src/intelligence/coverage.ts", "packages/movie/src/prompt/compilers.ts", "apps/worker/src/animation/still-motion.ts"],
  },
  {
    id: "audio", label: "Audio",
    owns: ["voices per character and narrator", "score and ambience", "the mix and loudness"],
    prompts: [],
    engines: ["apps/worker/src/voice/film.ts", "apps/worker/src/audio/score.ts", "apps/worker/src/ffmpeg/commands.ts"],
  },
  {
    id: "continuity", label: "Continuity",
    owns: ["identity, wardrobe, injuries, props and relationships across shots", "cast identities across productions and episodes"],
    prompts: [],
    engines: ["packages/movie/src/world/continuity.ts", "packages/movie/src/intelligence/cast.ts"],
  },
  {
    id: "editor_qc", label: "Editor / QC",
    owns: ["the cut as a whole and structured edits", "technical and visual quality gates", "launch copy for the finished film"],
    prompts: [PROMPTS.editorReview.id, PROMPTS.visualReview.id, PROMPTS.socialKit.id],
    engines: ["packages/movie/src/edit/operations.ts", "apps/worker/src/editor/editorial.ts", "apps/worker/src/quality", "apps/worker/src/review/visual-gate.ts"],
  },
];

/** The role a prompt belongs to (every registered prompt has exactly one). */
export function roleOfPrompt(promptId: string): DirectorialRole | null {
  return DIRECTORIAL_ROLES.find((r) => r.prompts.includes(promptId)) ?? null;
}
