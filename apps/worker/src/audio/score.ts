/**
 * The film score (docs/11). One track per film: the render engine lays a
 * single music bed under the whole cut, looped to length, so the opening
 * scene's music job composes it from the project's brief and every scene's
 * chosen style and mood.
 */

export interface ScoreScene {
  music: string | null;
  mood: string | null;
}

/** Default text-to-music model on fal and its longest clip. Overridable by env. */
export const SCORE_MODEL = process.env.FAL_MUSIC_MODEL ?? "fal-ai/stable-audio";
export const SCORE_MAX_SEC = Number(process.env.FAL_MUSIC_MAX_SEC ?? 47);

/** A concise, instrument-forward prompt for a text-to-music model. */
export function buildScorePrompt(brief: string, scenes: ScoreScene[]): string {
  const uniq = (xs: (string | null)[]) => [...new Set(xs.map((x) => x?.trim()).filter((x): x is string => !!x && x.toLowerCase() !== "none"))];
  const styles = uniq(scenes.map((s) => s.music));
  const moods = uniq(scenes.map((s) => s.mood));
  const parts = [
    "Cinematic film score, instrumental, no vocals",
    styles.length ? `style: ${styles.slice(0, 3).join(", ")}` : "",
    moods.length ? `mood: ${moods.slice(0, 3).join(", ")}` : "",
    brief.trim() ? `for a film about ${brief.trim().replace(/\s+/g, " ").slice(0, 160)}` : "",
  ];
  return parts.filter(Boolean).join("; ");
}

/** How long to ask the model for: the film's length, within the model's range. */
export function scoreSeconds(filmSec: number, maxSec: number = SCORE_MAX_SEC): number {
  return Math.max(10, Math.min(Math.round(filmSec) || 10, maxSec));
}
