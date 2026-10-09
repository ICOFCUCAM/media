/**
 * No Silent Degradation (DirectorOS DOS-75; docs/directoros/gap-analysis.md §6).
 *
 * When a production runs without something it asked for, the gap is either a
 * FAILURE (the result would be false — the job stops) or a DEGRADATION (the
 * result is still honest but weaker — it is recorded, stored and shown to the
 * user). Nothing in between: no stub, placeholder, empty result or quiet
 * substitution is ever delivered as if it were the real thing.
 */

/** Gaps that stop the job: delivering past them would be a fake completion (DOS-74). */
export type FailureCode =
  | "DIRECTOR_UNAVAILABLE" // no LLM key / provider error — never a stub film
  | "DIRECTOR_OUTPUT_INVALID" // plan failed validation (after one revision)
  | "DIRECTOR_REFUSED" // the planning model declined the brief
  | "PLACEHOLDER_OUTPUT" // a runtime returned placeholder media
  | "GPU_UNAVAILABLE"
  | "ARTIFACT_MISSING" // a provider claimed an object that is not in storage
  | "SHOTS_MISSING" // a film would be assembled with gaps
  | "AUDIO_MIX_FAILED" // a film would ship without its sound
  | "STORAGE_UNCONFIGURED"
  | "CONTINUITY_VIOLATION" // a shot contradicts canon (Continuity Engine, blocking) — not generated
  | "VISUAL_REVIEW_FAILED" // the generated frame contradicts canon twice (VISUAL_REVIEW=enforce)
  | "MODERATION_UNAVAILABLE"; // only when MODERATION_REQUIRED=1

/** Gaps that are recorded and shown, never hidden. */
export type DegradationCode =
  | "MODERATION_SKIPPED" // moderation provider unavailable (fail-open by configuration)
  | "CONTINUITY_INFERRED" // the Director gave no continuity; a heuristic filled it
  | "SEED_IMAGE_UNAVAILABLE" // no seed still; shot ran text-to-video
  | "REFERENCE_IGNORED" // reference image / video / camera input not used by the runtime
  | "LORA_SKIPPED" // identity LoRA requested but not applied
  | "LORA_TRAINER_UNAVAILABLE"
  | "OUTPUT_CLAMPED" // the runtime produced less resolution / fewer frames than requested
  | "MODEL_SUBSTITUTED"
  | "TRACK_MISSING" // a voice / music / SFX track the film should have
  | "UPSCALE_UNAVAILABLE"
  | "UPSCALE_FAILED"
  | "TRANSLATION_FAILED"
  | "RESOLUTION_UNSUPPORTED" // requested output format not available on the runtime
  | "BRAND_OUTRO_SKIPPED"
  | "WARDROBE_REFERENCE_UNAVAILABLE" // no wardrobe reference still for a framed character; identity frames only
  | "VISUAL_REVIEW_UNAVAILABLE" // the generated frame was not reviewed (no vision provider / frame)
  | "VISUAL_REVIEW_FLAGGED" // the Visual Reviewer found the frame contradicts canon (record mode)
  | "PROMPT_LIMITED" // the video model could not take part of the shot's canonical request (length, motion, negative prompt)
  | "CINEMA_ADVISORY"; // a film-grammar advisory on the plan (establishing shot, size repeat/jump, screen direction)

export type DegradationSeverity = "info" | "warning" | "major";
export type DegradationScope = "project" | "scene" | "shot" | "film" | "locale";

export interface Degradation {
  code: DegradationCode;
  severity: DegradationSeverity;
  scope: DegradationScope;
  /** Scene / shot / locale id the gap applies to. */
  refId?: string;
  /** Plain-language explanation shown to the user. */
  message: string;
  /** Machine detail (requested vs produced, provider, error class). */
  detail?: Record<string, unknown>;
}

const SEVERITY: Record<DegradationCode, DegradationSeverity> = {
  MODERATION_SKIPPED: "warning",
  CONTINUITY_INFERRED: "info",
  SEED_IMAGE_UNAVAILABLE: "warning",
  REFERENCE_IGNORED: "warning",
  LORA_SKIPPED: "warning",
  LORA_TRAINER_UNAVAILABLE: "info",
  OUTPUT_CLAMPED: "major",
  MODEL_SUBSTITUTED: "warning",
  TRACK_MISSING: "major",
  UPSCALE_UNAVAILABLE: "major",
  UPSCALE_FAILED: "major",
  TRANSLATION_FAILED: "major",
  RESOLUTION_UNSUPPORTED: "major",
  BRAND_OUTRO_SKIPPED: "warning",
  WARDROBE_REFERENCE_UNAVAILABLE: "info",
  VISUAL_REVIEW_UNAVAILABLE: "info",
  VISUAL_REVIEW_FLAGGED: "major",
  PROMPT_LIMITED: "info",
  CINEMA_ADVISORY: "info",
};

export function degradation(
  code: DegradationCode,
  scope: DegradationScope,
  message: string,
  opts: { refId?: string; detail?: Record<string, unknown>; severity?: DegradationSeverity } = {},
): Degradation {
  return { code, severity: opts.severity ?? SEVERITY[code], scope, message, refId: opts.refId, detail: opts.detail };
}

/** A job-stopping gap. `UnrecoverableError`-compatible callers wrap it. */
export class ProductionFailure extends Error {
  constructor(
    readonly code: FailureCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(`${code}: ${message}`);
    this.name = "ProductionFailure";
  }
}

export function isProductionFailure(e: unknown): e is ProductionFailure {
  return e instanceof ProductionFailure;
}

/** Execution report of one self-hosted run (mirrors apps/gpu-worker `last_execution`). */
export interface RunReport {
  mode: "real" | "placeholder";
  width?: number;
  height?: number;
  frames?: number;
  fps?: number;
  referenceImagesIgnored?: number;
  referenceVideoIgnored?: boolean;
  cameraIgnored?: boolean;
  lorasSkipped?: { key: string; reason: string }[];
}

/**
 * Judge a runtime's report against the request. Placeholder output is a
 * failure unless explicitly allowed (tests / local runs); everything the
 * runtime did not do becomes a degradation.
 */
export function judgeRun(
  report: RunReport | undefined,
  realExecution: boolean | undefined,
  request: { width: number; height: number; durationSec: number; fps: number; shotId: string },
  opts: { allowPlaceholder?: boolean } = {},
): { failure?: ProductionFailure; degradations: Degradation[] } {
  const degradations: Degradation[] = [];
  if (realExecution === false || report?.mode === "placeholder") {
    if (!opts.allowPlaceholder) {
      return {
        failure: new ProductionFailure("PLACEHOLDER_OUTPUT", "the GPU runtime returned placeholder media, not a generation", {
          shotId: request.shotId,
        }),
        degradations,
      };
    }
  }
  if (!report) return { degradations };
  const ref = { refId: request.shotId };
  if (report.width && report.height && (report.width < request.width || report.height < request.height)) {
    degradations.push(
      degradation("OUTPUT_CLAMPED", "shot", `Rendered at ${report.width}×${report.height} instead of ${request.width}×${request.height}.`, {
        ...ref,
        detail: { requested: [request.width, request.height], produced: [report.width, report.height] },
      }),
    );
  }
  const wantFrames = Math.max(1, Math.floor(request.durationSec * request.fps));
  if (report.frames && report.frames < wantFrames) {
    const fps = report.fps ?? request.fps;
    degradations.push(
      degradation(
        "OUTPUT_CLAMPED",
        "shot",
        `Generated ${(report.frames / fps).toFixed(2)} s of the requested ${request.durationSec} s (${report.frames}/${wantFrames} frames).`,
        { ...ref, detail: { requestedFrames: wantFrames, producedFrames: report.frames } },
      ),
    );
  }
  if ((report.referenceImagesIgnored ?? 0) > 0 || report.referenceVideoIgnored || report.cameraIgnored) {
    const what = [
      (report.referenceImagesIgnored ?? 0) > 0 ? "reference image" : null,
      report.referenceVideoIgnored ? "reference video" : null,
      report.cameraIgnored ? "camera plan" : null,
    ].filter(Boolean);
    degradations.push(
      degradation("REFERENCE_IGNORED", "shot", `The video model did not use the ${what.join(", ")}.`, {
        ...ref,
        severity: (report.referenceImagesIgnored ?? 0) > 0 ? "warning" : "info",
        detail: { ignored: what },
      }),
    );
  }
  for (const l of report.lorasSkipped ?? []) {
    if (l.reason === "PLACEHOLDER") continue;
    degradations.push(
      degradation("LORA_SKIPPED", "shot", "The character identity model (LoRA) was not applied to this shot.", {
        ...ref,
        detail: l,
      }),
    );
  }
  return { degradations };
}
