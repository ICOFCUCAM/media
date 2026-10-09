/** The pass rules (W8b), free of queues and the database so they are tested on their own. */

export type Pass = "single" | "story" | "previs" | "final";

export function currentPass(project: { passMode: string; storyApprovedAt: Date | null }, scenes: { storyboardApprovedAt: Date | null }[]): Pass {
  if (project.passMode !== "three") return "single";
  if (!project.storyApprovedAt) return "story";
  return scenes.length && scenes.every((s) => s.storyboardApprovedAt) ? "final" : "previs";
}

/** Scenes that may generate video now: every scene in a single-pass film, approved ones in a three-pass film. */
export function scenesCleared<T extends { storyboardApprovedAt: Date | null }>(passMode: string, scenes: T[]): T[] {
  return passMode === "three" ? scenes.filter((s) => s.storyboardApprovedAt) : scenes;
}
