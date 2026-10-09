/**
 * Results of the real-provider tests (DirectorOS Part 2 §76; W10).
 *
 * A probe is one real call to one provider whose ARTIFACT is then verified
 * (bytes decoded, measured with ffprobe/ffmpeg) — a returned URL or a 200 is
 * never a pass. A probe that cannot run says why: NOT_CONFIGURED (no
 * credentials or endpoint in this environment) or GATED (the capability waits
 * on an owner gate, e.g. ComfyUI on docs/39 Phase 1). Neither is a PASS, so a
 * run with nothing configured is INCOMPLETE, never green.
 */

export type Capability = "planning" | "image" | "video" | "voice" | "music";
export const CAPABILITIES: Capability[] = ["planning", "image", "video", "voice", "music"];

export type ProbeStatus = "PASS" | "FAIL" | "NOT_CONFIGURED" | "GATED";

export interface ProbeResult {
  id: string;
  capability: Capability;
  provider: string;
  status: ProbeStatus;
  /** Why it did not pass (failure, missing configuration or gate). */
  reason: string | null;
  /** What was measured on the artifact. */
  evidence: Record<string, unknown>;
  latencyMs: number | null;
}

export type SuiteStatus = "PASS" | "FAIL" | "INCOMPLETE";

export interface SuiteVerdict {
  status: SuiteStatus;
  /** Required capabilities with no passing probe. */
  missing: Capability[];
  failed: string[];
}

/**
 * PASS only when every required capability has at least one passing probe and
 * no probe failed. A failure anywhere is FAIL, even for a capability that also
 * has a passing provider: a configured provider that does not work is a defect.
 */
export function suiteVerdict(results: ProbeResult[], required: Capability[] = CAPABILITIES): SuiteVerdict {
  const failed = results.filter((r) => r.status === "FAIL").map((r) => r.id);
  const missing = required.filter((c) => !results.some((r) => r.capability === c && r.status === "PASS"));
  return { status: failed.length ? "FAIL" : missing.length ? "INCOMPLETE" : "PASS", missing, failed };
}

export function exitCode(v: SuiteVerdict): number {
  return v.status === "PASS" ? 0 : v.status === "FAIL" ? 1 : 3;
}

export function formatReport(results: ProbeResult[], v: SuiteVerdict): string {
  const rows = results.map((r) => {
    const t = r.latencyMs === null ? "" : ` (${(r.latencyMs / 1000).toFixed(1)}s)`;
    return `${r.status.padEnd(14)} ${r.id}${t}${r.reason ? ` — ${r.reason}` : ""}`;
  });
  const tail = [
    v.missing.length ? `no passing provider for: ${v.missing.join(", ")}` : null,
    v.failed.length ? `failed: ${v.failed.join(", ")}` : null,
    `REAL_PROVIDERS: ${v.status}`,
  ].filter(Boolean);
  return [...rows, "", ...tail].join("\n");
}

export function parseRequired(arg: string | undefined): Capability[] {
  if (!arg) return CAPABILITIES;
  const list = arg.split(",").map((s) => s.trim()).filter(Boolean);
  for (const c of list) if (!CAPABILITIES.includes(c as Capability)) throw new Error(`unknown capability "${c}" (use ${CAPABILITIES.join(", ")})`);
  return list as Capability[];
}
