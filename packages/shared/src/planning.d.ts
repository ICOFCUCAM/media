/**
 * Shared film-planning math (docs/05, docs/09). One source of truth so the
 * Director (which creates the shots) and the cost governor (which estimates
 * before generation) never disagree on how many scenes/shots a film has.
 */
export declare const AVG_SCENE_SEC = 18;
export declare const AVG_SHOT_SEC = 5;
export declare const MAX_SCENES = 400;
export declare function planSceneCount(targetSeconds: number): number;
export declare function planShotsPerScene(): number;
export declare function planShotCount(targetSeconds: number): number;
