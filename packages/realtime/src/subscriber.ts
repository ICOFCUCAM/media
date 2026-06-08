import Redis from "ioredis";
import { REALTIME_CHANNEL, type RealtimeEnvelope } from "./events";

/**
 * Subscribes to the realtime channel and invokes a handler for each envelope.
 * The API gateway uses this to forward events into Socket.IO rooms.
 */
export class RealtimeSubscriber {
  private readonly redis: Redis;
  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  async start(onMessage: (env: RealtimeEnvelope) => void): Promise<void> {
    await this.redis.subscribe(REALTIME_CHANNEL);
    this.redis.on("message", (_channel, payload) => {
      try {
        onMessage(JSON.parse(payload) as RealtimeEnvelope);
      } catch {
        /* ignore malformed payloads */
      }
    });
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
