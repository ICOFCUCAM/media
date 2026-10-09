/**
 * The voice benchmark runner (DirectorOS W14; Part 4 §136). Every engine
 * CineForge may use reads the same scripts, in the owner's own cloned voice
 * (or a built-in voice when none is given), and each is measured the same way:
 * word error rate of the speech transcribed back, real-time factor, loudness
 * and pace consistency across segments, and its licence status. It always
 * generates (never the speech cache) and records the run in benchmark_runs
 * (suite "voice"). What cannot be measured honestly is reported as such.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BENCH_SCRIPTS,
  consistency,
  ENGINE_REGISTRY,
  licenceStatus,
  NOT_MEASURED,
  normalizeWords,
  parseVoiceEngines,
  segmentScript,
  summarizeEngine,
  wordErrorRate,
  type BenchCaseResult,
  type BenchScript,
  type SegmentMeasure,
  type VoiceEngine,
  type VoiceEngineArtifact,
} from "@cineforge/voice-contracts";

export interface VoiceBenchDeps {
  env: Record<string, string | undefined>;
  /** A raw engine (no cache, no metering), or null when it cannot be built. */
  engine(id: string): VoiceEngine | null;
  /** The cloned voice's artifact for this engine, or null. */
  artifact(voiceId: string, engine: VoiceEngine): Promise<VoiceEngineArtifact | null>;
  measure(path: string): Promise<{ durationSec: number; integratedLufs: number | null }>;
  /** Speech → text, or null when no transcriber is configured. */
  transcribe: ((path: string, language: string) => Promise<string>) | null;
  now(): number;
}

export interface VoiceBenchOptions {
  voiceId?: string | null;
  scripts?: string[];
  engines?: string[];
}

export interface VoiceBenchReport {
  voice: string;
  engines: Record<string, { licence: { cleared: boolean; reasons: string[] }; skipped?: string; summary?: Record<string, number | null>; cases: BenchCaseResult[] }>;
  notMeasured: typeof NOT_MEASURED & { pronunciation?: string };
}

async function runScript(engine: VoiceEngine, script: BenchScript, artifact: VoiceEngineArtifact | null, deps: VoiceBenchDeps, dir: string): Promise<BenchCaseResult> {
  const base = { engine: engine.id, script: script.id, language: script.language, kind: script.kind };
  try {
    const segments = segmentScript(script.text, Math.min(engine.getCapabilities().maxChars, 1000));
    const measured: (SegmentMeasure & { path: string })[] = [];
    let genMs = 0;
    for (const seg of segments) {
      const out = join(dir, `${engine.id}-${script.id}-${seg.sequence}`);
      const t0 = deps.now();
      const r = await engine.synthesize({ text: seg.text, language: script.language, voice: artifact, outPath: out });
      genMs += deps.now() - t0;
      const m = await deps.measure(r.path);
      measured.push({ path: r.path, words: normalizeWords(seg.text).length, durationSec: m.durationSec, integratedLufs: m.integratedLufs });
    }
    const audioSec = measured.reduce((a, s) => a + s.durationSec, 0);
    let wer: number | null = null;
    if (deps.transcribe) {
      const heard: string[] = [];
      for (const s of measured) heard.push(await deps.transcribe(s.path, script.language));
      wer = wordErrorRate(script.text, heard.join(" "));
    }
    const c = consistency(measured);
    return { ...base, ok: true, audioSec, realTimeFactor: audioSec > 0 ? genMs / 1000 / audioSec : undefined, wer, ...c };
  } catch (e) {
    return { ...base, ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}

export async function runVoiceBenchmark(deps: VoiceBenchDeps, opts: VoiceBenchOptions = {}): Promise<VoiceBenchReport> {
  const scripts = BENCH_SCRIPTS.filter((s) => !opts.scripts?.length || opts.scripts.includes(s.id));
  const ids = opts.engines?.length ? opts.engines : parseVoiceEngines(deps.env.VOICE_ENGINES).map((e) => e.id);
  const report: VoiceBenchReport = {
    voice: opts.voiceId ? `cloned voice ${opts.voiceId}` : "built-in voice",
    engines: {},
    notMeasured: { ...NOT_MEASURED, ...(deps.transcribe ? {} : { pronunciation: "not measured — no transcriber configured (OPENAI_API_KEY)" }) },
  };
  const dir = await mkdtemp(join(tmpdir(), "voice-bench-"));
  try {
    for (const id of ids) {
      const licence = licenceStatus(id, deps.env);
      const entry: VoiceBenchReport["engines"][string] = { licence: { cleared: licence.cleared, reasons: licence.reasons }, cases: [] };
      report.engines[id] = entry;
      const d = ENGINE_REGISTRY[id];
      // The benchmark never runs a model CineForge may not use (§141): gated or uncleared engines are listed, not run.
      if (!d) { entry.skipped = "unknown engine"; continue; }
      if (d.gated) { entry.skipped = d.gated; continue; }
      if (!licence.cleared) { entry.skipped = `licence: ${licence.reasons.join("; ")}`; continue; }
      const engine = deps.engine(id);
      if (!engine) { entry.skipped = `not configured (${d.requires.join(", ")})`; continue; }
      let artifact: VoiceEngineArtifact | null = null;
      if (opts.voiceId) {
        if (!engine.getCapabilities().voiceCloning) { entry.skipped = "cannot speak in a cloned voice"; continue; }
        artifact = await deps.artifact(opts.voiceId, engine);
        if (!artifact) { entry.skipped = "the voice is not enrolled with this engine"; continue; }
      }
      for (const s of scripts) entry.cases.push(await runScript(engine, s, artifact, deps, dir));
      entry.summary = summarizeEngine(entry.cases);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return report;
}

/** The run's outcome for benchmark_runs: pass only when every engine that ran succeeded on every script. */
export function benchmarkStatus(r: VoiceBenchReport): "pass" | "fail" | "incomplete" {
  const ran = Object.values(r.engines).filter((e) => !e.skipped);
  if (!ran.length) return "incomplete";
  return ran.every((e) => e.cases.every((c) => c.ok)) ? "pass" : "fail";
}
