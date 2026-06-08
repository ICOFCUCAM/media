import { RealtimePublisher } from "@cineforge/realtime";

/** Shared realtime publisher for all worker processors. */
export const realtime = new RealtimePublisher(process.env.REDIS_URL ?? "redis://localhost:6379");
