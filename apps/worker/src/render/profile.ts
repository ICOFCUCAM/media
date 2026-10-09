import { mixSpec, syncPolicy } from "@cineforge/shared";

/**
 * The production profile the master is mixed and judged by (W16): its sync
 * policy's delivery spec (loudness, true peak) and its mix spec (stem levels,
 * ducking). RENDER_SYNC_PROFILE, else RUNTIME_SYNC_PROFILE, else cinematic.
 */
export function renderProfile(env: NodeJS.ProcessEnv = process.env) {
  const policy = syncPolicy(env.RENDER_SYNC_PROFILE?.trim() || env.RUNTIME_SYNC_PROFILE?.trim() || "cinematic");
  return { policy, mix: mixSpec(policy), delivery: { integratedLufs: policy.delivery.integratedLufs, truePeakDbtp: policy.delivery.truePeakDbtp } };
}
