/**
 * Reference Pack assembler (W6). The reference images one shot is generated
 * with, in priority order, deduplicated and capped at what the runtime takes:
 *
 *   1. seed frame         the still the shot starts from (image-to-video)
 *   2. previous end frame the last frame of the shot before it in the same
 *                         continuous action (shot-to-shot end-state memory)
 *   3. wardrobe stills    each framed character in this scene's wardrobe
 *   4. identity frames    each framed character's reference frames
 *
 * Whatever does not fit is listed, not silently lost.
 */
export interface ReferencePackInput {
  seed?: string | null;
  previousEndFrame?: string | null;
  wardrobe?: string[];
  identity?: string[];
  max?: number;
}

export interface ReferencePack {
  keys: string[];
  roles: Record<string, "seed" | "previous_end_frame" | "wardrobe" | "identity">;
  dropped: string[];
}

export function assembleReferencePack(i: ReferencePackInput): ReferencePack {
  const max = i.max ?? 4;
  const ordered: (readonly [string, ReferencePack["roles"][string]])[] = [
    ...(i.seed ? [[i.seed, "seed"] as const] : []),
    ...(i.previousEndFrame ? [[i.previousEndFrame, "previous_end_frame"] as const] : []),
    ...(i.wardrobe ?? []).map((k) => [k, "wardrobe"] as const),
    ...(i.identity ?? []).map((k) => [k, "identity"] as const),
  ];
  const keys: string[] = [];
  const roles: ReferencePack["roles"] = {};
  const dropped: string[] = [];
  for (const [k, role] of ordered) {
    if (roles[k]) continue;
    if (keys.length >= max) { dropped.push(k); continue; }
    keys.push(k);
    roles[k] = role;
  }
  return { keys, roles, dropped };
}

/** Where a shot's last frame is stored (end-state memory). */
export const endFrameKey = (projectId: string, shotId: string) => `projects/${projectId}/frames/${shotId}-end.jpg`;
