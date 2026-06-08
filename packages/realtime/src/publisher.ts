import Redis from "ioredis";
import {
  REALTIME_CHANNEL,
  projectRoom,
  type RealtimeEnvelope,
  type RealtimeEventName,
  type RealtimeEvents,
} from "./events";

/**
 * Publishes realtime events from any process (workers) onto the Redis channel.
 * The API gateway subscribes and forwards to connected clients. This decouples
 * the (separate) worker processes from the WebSocket layer and works across
 * many API nodes. See docs/04 + docs/01 (WebSocket fan-out via Redis).
 */
export class RealtimePublisher {
  private readonly redis: Redis;
  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  /** Publish to a project's room. `data.projectId` determines the room. */
  async emit<E extends RealtimeEventName>(event: E, data: RealtimeEvents[E]): Promise<void> {
    const envelope: RealtimeEnvelope<E> = {
      room: projectRoom((data as { projectId: string }).projectId),
      event,
      data,
    };
    await this.redis.publish(REALTIME_CHANNEL, JSON.stringify(envelope));
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
