/** Production wiring of the scene voice composer (film voices and dubs). */
import { prisma } from "@cineforge/db";
import type { VoiceEngineArtifact } from "@cineforge/voice-contracts";
import type { S3Storage } from "../storage/storage";
import { voiceEngine } from "./engines";
import { meter, meteredEngine, type MeterContext } from "../billing";
import type { SceneVoiceDeps } from "./film";
import { joinSegments, masterSegment, measureSpeech } from "./mastering";

/** `ctx` names who pays for the speech (W11 metering). */
export function sceneVoiceDeps(storage: S3Storage, ctx: MeterContext): SceneVoiceDeps {
  return {
    env: process.env,
    engine: (id) => {
      const e = voiceEngine(id, process.env);
      return e && meteredEngine(e, ctx, meter);
    },
    voice: (id) => prisma.voice.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, consentType: true, consentConfirmedAt: true, provider: true, providerVoiceId: true },
    }),
    artifact: async (voiceId, engineId, engineVersion) => {
      const a = await prisma.voiceEngineArtifact.findUnique({ where: { voiceId_engineId_engineVersion: { voiceId, engineId, engineVersion } } });
      return a && ({ artifactType: a.artifactType, uri: a.artifactUri } as VoiceEngineArtifact);
    },
    master: masterSegment,
    join: joinSegments,
    measure: measureSpeech,
    upload: (path, key, type) => storage.upload(path, key, type),
  };
}
