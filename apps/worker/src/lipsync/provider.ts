/**
 * Lip-sync providers (W21). A hosted model on fal by default
 * (FAL_LIPSYNC_MODEL, default fal-ai/sync-lipsync): the shot's clip and its
 * dialogue stem in, the clip with the speaker's mouth moved to the words out.
 * Self-hosted lip-sync models wait on Phase 1.
 */
import { falFindUrl, falRunQueue, falUploadBytes } from "@cineforge/model-adapters";

export interface LipSyncProvider {
  id: string;
  model: string;
  sync(video: Uint8Array, audio: Uint8Array): Promise<Uint8Array>;
}

export function lipSyncProvider(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): LipSyncProvider | null {
  const key = env.FAL_KEY;
  if (!key) return null;
  const model = env.FAL_LIPSYNC_MODEL?.trim() || "fal-ai/sync-lipsync";
  return {
    id: "fal",
    model,
    async sync(video, audio) {
      const [videoUrl, audioUrl] = await Promise.all([
        falUploadBytes(key, video, "video/mp4", "shot.mp4"),
        falUploadBytes(key, audio, "audio/wav", "dialogue.wav"),
      ]);
      // cut_off: the output keeps the clip's length; the stem is already exactly that long.
      const result = await falRunQueue(key, model, { video_url: videoUrl, audio_url: audioUrl, sync_mode: "cut_off" }, { timeoutMs: 15 * 60_000 });
      const url = falFindUrl(result);
      if (!url) throw new Error(`lip-sync model returned no video (${JSON.stringify(result).slice(0, 200)})`);
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`lip-sync download ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.length) throw new Error("lip-sync model returned an empty video");
      return bytes;
    },
  };
}
