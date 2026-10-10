/**
 * Reference Pack assembler (W6). The reference images one shot is generated
 * with, in priority order, deduplicated and capped at what the runtime takes:
 *
 *   1. seed frame         the still the shot starts from (image-to-video)
 *   2. previous end frame the last frame of the shot before it in the same
 *                         continuous action (shot-to-shot end-state memory)
 *   3. wardrobe stills    each framed character in this scene's wardrobe
 *   4. identity frames    each framed character's reference frames
 *   5. camera reference   the scene's establishing frame: the set as the camera
 *                         first showed it, so later angles keep its geography (W24)
 *   6. location still     the scene's place as canon describes it (W17)
 *   7. style still        the film's look in one frame (W24)
 *   8. prop stills        each prop in frame (W17)
 *
 * Whatever does not fit is listed, not silently lost.
 */
export interface ReferencePackInput {
  seed?: string | null;
  previousEndFrame?: string | null;
  wardrobe?: string[];
  identity?: string[];
  camera?: string[];
  location?: string[];
  style?: string[];
  props?: string[];
  max?: number;
}

export interface ReferencePack {
  keys: string[];
  roles: Record<string, "seed" | "previous_end_frame" | "wardrobe" | "identity" | "camera" | "location" | "style" | "prop">;
  dropped: string[];
}

export function assembleReferencePack(i: ReferencePackInput): ReferencePack {
  const max = i.max ?? 4;
  const ordered: (readonly [string, ReferencePack["roles"][string]])[] = [
    ...(i.seed ? [[i.seed, "seed"] as const] : []),
    ...(i.previousEndFrame ? [[i.previousEndFrame, "previous_end_frame"] as const] : []),
    ...(i.wardrobe ?? []).map((k) => [k, "wardrobe"] as const),
    ...(i.identity ?? []).map((k) => [k, "identity"] as const),
    ...(i.camera ?? []).map((k) => [k, "camera"] as const),
    ...(i.location ?? []).map((k) => [k, "location"] as const),
    ...(i.style ?? []).map((k) => [k, "style"] as const),
    ...(i.props ?? []).map((k) => [k, "prop"] as const),
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
