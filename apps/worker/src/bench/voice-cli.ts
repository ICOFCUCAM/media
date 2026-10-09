/**
 * The voice benchmark (DirectorOS W14; Part 4 §136).
 *
 *   pnpm --filter @cineforge/worker voice:bench [--voice <voice id>] [--scripts en-narration-30s,fr-narration-30s]
 *                                               [--engines fal-minimax,openai-tts] [--out report.json] [--record]
 *
 * Spends real money: every script through every usable engine, always generated
 * (never the speech cache). With --voice the engines speak in that cloned voice
 * — it must be READY with consent recorded. Speech is transcribed back with
 * OpenAI (OPENAI_API_KEY) to measure pronunciation; without it, pronunciation
 * is reported as not measured. Gated or licence-uncleared engines are listed
 * with the reason and never run. Exit 0 = pass, 1 = an engine failed a script,
 * 3 = incomplete (nothing could run).
 */
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { providerUrl } from "@cineforge/shared";
import type { VoiceEngineArtifact } from "@cineforge/voice-contracts";
import { voiceEngine } from "../voice/engines";
import { measureSpeech } from "../voice/mastering";
import { benchmarkStatus, runVoiceBenchmark, type VoiceBenchDeps } from "./voice";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const list = (v: string | undefined) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

/** OpenAI speech-to-text, or null when no key is configured. */
export function openAiTranscriber(env: Record<string, string | undefined>, f: typeof fetch = fetch): VoiceBenchDeps["transcribe"] {
  const key = env.OPENAI_API_KEY;
  if (!key) return null;
  return async (path, language) => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(await readFile(path))]), basename(path));
    form.append("model", env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1");
    form.append("language", language);
    form.append("response_format", "json");
    const res = await f(`${providerUrl("openai", env)}/audio/transcriptions`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form });
    if (!res.ok) throw new Error(`OpenAI transcription ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return ((await res.json()) as { text?: string }).text ?? "";
  };
}

async function main(): Promise<number> {
  const voiceId = arg("voice") ?? null;
  const deps: VoiceBenchDeps = {
    env: process.env,
    engine: (id) => voiceEngine(id, process.env),
    artifact: async () => null,
    measure: measureSpeech,
    transcribe: openAiTranscriber(process.env),
    now: () => Date.now(),
  };
  if (voiceId) {
    const { prisma } = await import("@cineforge/db");
    const v = await prisma.voice.findUnique({ where: { id: voiceId }, select: { status: true, consentType: true, consentConfirmedAt: true } });
    if (!v) throw new Error(`voice ${voiceId} not found`);
    if (v.status !== "READY") throw new Error(`voice ${voiceId} is ${v.status}, not READY`);
    // The same rule as production: no cloned speech without recorded consent (W7).
    if (!v.consentType || !v.consentConfirmedAt) throw new Error(`voice ${voiceId} has no recorded consent`);
    deps.artifact = async (id, engine) => {
      const a = await prisma.voiceEngineArtifact.findUnique({ where: { voiceId_engineId_engineVersion: { voiceId: id, engineId: engine.id, engineVersion: engine.version } } });
      return a && ({ artifactType: a.artifactType, uri: a.artifactUri } as VoiceEngineArtifact);
    };
  }
  const report = await runVoiceBenchmark(deps, { voiceId, scripts: list(arg("scripts")), engines: list(arg("engines")) });
  const status = benchmarkStatus(report);
  for (const [id, e] of Object.entries(report.engines)) {
    if (e.skipped) console.log(`${"skipped".padEnd(9)} ${id} — ${e.skipped}`);
    else console.log(`${"ran".padEnd(9)} ${id} ${JSON.stringify(e.summary)}`);
  }
  for (const [k, v] of Object.entries(report.notMeasured)) console.log(`${k}: ${v}`);
  const full = { at: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? process.env.SOURCE_COMMIT ?? null, status, ...report };
  const out = arg("out");
  if (out) await writeFile(out, JSON.stringify(full, null, 2));
  if (process.argv.includes("--record")) {
    const [{ prisma }, { recordBenchmarkRun }] = await Promise.all([import("@cineforge/db"), import("./record")]);
    const id = await recordBenchmarkRun(prisma as never, {
      suite: "voice", status, score: null,
      metrics: { voice: report.voice, engines: Object.fromEntries(Object.entries(report.engines).map(([k, e]) => [k, { licence: e.licence, skipped: e.skipped ?? null, summary: e.summary ?? null }])), notMeasured: report.notMeasured },
      cases: Object.values(report.engines).flatMap((e) => e.cases),
    });
    console.log(`recorded benchmark_runs ${id}`);
  }
  console.log(`voice benchmark: ${status.toUpperCase()}`);
  return status === "pass" ? 0 : status === "fail" ? 1 : 3;
}

if (process.argv[1]?.endsWith("voice-cli.ts")) {
  main()
    .then(async (code) => {
      if (process.env.DATABASE_URL) await (await import("@cineforge/db")).prisma.$disconnect().catch(() => undefined);
      process.exit(code);
    })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
