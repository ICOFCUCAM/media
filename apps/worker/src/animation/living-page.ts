/**
 * Character animation inside the page (DirectorOS W26; Part 5 §181.4–5:
 * "illustrated pages → camera movement → character animation"). By default a
 * storybook page or comic panel is moved by the camera alone (still-motion,
 * no GPU). With STILL_MOTION_ANIMATE, a page that frames a character is
 * instead brought to life by the production's video model from the drawn
 * page itself: the characters breathe, blink, gesture and act the beat while
 * the drawing — its lines, colours and composition — stays as drawn.
 *
 *   STILL_MOTION_ANIMATE=off         camera moves only (default)
 *   STILL_MOTION_ANIMATE=characters  pages with a character in frame are animated
 *   STILL_MOTION_ANIMATE=all         every page is animated
 *
 * An animated page costs GPU time; it runs only while the film's budget has
 * room for it, and falls back to the camera move — recorded — when it has not
 * or when the model fails.
 */
export type LivingPageMode = "off" | "characters" | "all";

export function livingPageMode(env: Record<string, string | undefined> = process.env): LivingPageMode {
  const v = env.STILL_MOTION_ANIMATE?.trim();
  return v === "characters" || v === "all" ? v : "off";
}

/** Whether this page is animated by the video model (pure). */
export function animatePage(mode: LivingPageMode, framesCharacter: boolean, headroomMs: number | null, expectedMs: number): { animate: boolean; reason?: string } {
  if (mode === "off") return { animate: false };
  if (mode === "characters" && !framesCharacter) return { animate: false };
  if (headroomMs !== null && headroomMs < expectedMs) return { animate: false, reason: "the film's budget has no room for an animated page" };
  return { animate: true };
}

/** The video prompt for a drawn page (pure): the page's own prompt, told to keep the drawing and move the characters. */
export function livingPagePrompt(prompt: string, style: string | null): string {
  return [
    prompt.trim(),
    `Animate this illustrated ${style ? `${style} ` : ""}page as it is drawn: the characters come to life — breathing, blinking, small gestures and the action of the moment — while the drawing style, line work, colours and composition stay exactly as drawn. Gentle camera movement only. No new characters, no text.`,
  ].join("\n\n");
}
