/**
 * The voice benchmark (DirectorOS W14; Part 4 §136).
 *
 *   pnpm --filter @cineforge/worker voice:bench [--voice <voice id>] [--scripts en-narration-30s,fr-narration-30s]
 *                                               [--engines fal-minimax,openai-tts] [--out report.json] [--record]
 *                                               [--evaluate] [--enroll]
 *
 * Self-hosted engines (docs/74): --evaluate runs engines that are configured
 * but not yet approved for production, when their licence permits evaluation
 * (marked "evaluation only" in the report); --enroll enrolls the --voice
 * recording with each engine it is not enrolled with yet (same consent rule).
 * VOICE_SIMILARITY_ENGINE=qwen3-tts|cosyvoice-3 scores every engine's speech
 * against the voice's reference recording with that deployment's speaker
 * encoder — one scorer for all engines.
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
import { evaluationAllowed, isSelfHostedVoiceEngine, licenceStatus } from "@cineforge/voice-contracts";
import { voiceEngine } from "../voice/engines";
import { measureSpeech } from "../voice/mastering";
import { SelfHostedVoiceEngine } from "../voice/selfhosted";
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

/**
 * The voice-similarity scorer (VOICE_SIMILARITY_ENGINE): a configured
 * self-hosted engine with a speaker encoder whose licence permits at least
 * evaluation. Null (similarity reported as not measured) otherwise, with why.
 */
export function similarityScorer(env: Record<string, string | undefined>): { engine: SelfHostedVoiceEngine | null; why: string | null } {
  const id = env.VOICE_SIMILARITY_ENGINE?.trim();
  if (!id) return { engine: null, why: null };
  if (!isSelfHostedVoiceEngine(id) || id === "gpt-sovits") return { engine: null, why: `${id} has no speaker encoder for scoring (use qwen3-tts or cosyvoice-3)` };
  if (!evaluationAllowed(id).allowed) return { engine: null, why: `${id}: ${evaluationAllowed(id).reason}` };
  const e = voiceEngine(id, env);
  if (!(e instanceof SelfHostedVoiceEngine)) return { engine: null, why: `${id} is not configured` };
  return { engine: e, why: null };
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
      return a && ({ artifactType: a.artifactType, uri: a.artifactUri, metadata: a.metadata as Record<string, unknown> } as VoiceEngineArtifact);
    };
    const full = await prisma.voice.findUnique({ where: { id: voiceId }, select: { userId: true, sampleKey: true, language: true } });
    // Enrol the owner's own recording with an engine it is not enrolled with yet (docs/74).
    deps.enroll = async (id, engine) => {
      if (!full?.sampleKey || !full.sampleKey.startsWith(`voices/${full.userId}/`)) throw new Error("the voice has no stored recording of its own");
      const [{ S3Storage }, { mkdtemp, rm }, { tmpdir }, { join }] = await Promise.all([import("../storage/storage"), import("node:fs/promises"), import("node:os"), import("node:path")]);
      const dir = await mkdtemp(join(tmpdir(), "voice-bench-enroll-"));
      try {
        const ref = join(dir, `reference.${full.sampleKey.split(".").pop() ?? "wav"}`);
        await new S3Storage().download(full.sampleKey, ref);
        const { artifacts } = await engine.enrollVoice({ voiceId: id, language: full.language ?? "en", referencePath: ref, userId: full.userId, referenceKey: full.sampleKey });
        const a = artifacts[0];
        if (!a) return null;
        const data = { artifactType: a.artifactType, artifactUri: a.uri, metadata: { ...(a.metadata ?? {}), enrolledBy: "voice:bench" } as never };
        await prisma.voiceEngineArtifact.upsert({
          where: { voiceId_engineId_engineVersion: { voiceId: id, engineId: engine.id, engineVersion: engine.version } },
          create: { voiceId: id, engineId: engine.id, engineVersion: engine.version, ...data }, update: data, select: { id: true },
        });
        return a;
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    };
    const scorer = similarityScorer(process.env);
    if (scorer.why) console.log(`voice similarity: not measured — ${scorer.why}`);
    if (scorer.engine && full?.sampleKey) {
      const e = scorer.engine;
      if (!licenceStatus(e.id, process.env).cleared) console.log(`voice similarity scorer ${e.id} is not approved for production: used for evaluation only`);
      deps.similarity = (paths) => e.similarity(full.sampleKey!, paths);
    }
  }
  const report = await runVoiceBenchmark(deps, {
    voiceId, scripts: list(arg("scripts")), engines: list(arg("engines")),
    evaluation: process.argv.includes("--evaluate"), enroll: process.argv.includes("--enroll"),
  });
  const status = benchmarkStatus(report);
  for (const [id, e] of Object.entries(report.engines)) {
    if (e.skipped) console.log(`${"skipped".padEnd(9)} ${id} — ${e.skipped}`);
    else console.log(`${"ran".padEnd(9)} ${id}${e.evaluationOnly ? " (evaluation only — not approved for production)" : ""} ${JSON.stringify(e.summary)}`);
  }
  for (const [k, v] of Object.entries(report.notMeasured)) console.log(`${k}: ${v}`);
  const full = { at: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? process.env.SOURCE_COMMIT ?? null, status, ...report };
  const out = arg("out");
  if (out) await writeFile(out, JSON.stringify(full, null, 2));
  if (process.argv.includes("--record")) {
    const [{ prisma }, { recordBenchmarkRun }] = await Promise.all([import("@cineforge/db"), import("./record")]);
    const id = await recordBenchmarkRun(prisma as never, {
      suite: "voice", status, score: null,
      metrics: { voice: report.voice, engines: Object.fromEntries(Object.entries(report.engines).map(([k, e]) => [k, { licence: e.licence, evaluationOnly: e.evaluationOnly ?? false, skipped: e.skipped ?? null, unsupportedScripts: e.unsupportedScripts ?? [], summary: e.summary ?? null }])), notMeasured: report.notMeasured, similarityScorer: report.similarityScorer ?? null },
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
