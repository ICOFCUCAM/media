/**
 * Realtime event contracts (docs/04 WebSocket section). Workers publish these
 * to a Redis channel; the API's Socket.IO gateway forwards them to the matching
 * project room. One source of truth for both sides.
 */

export const REALTIME_CHANNEL = "cineforge:realtime";

/** A room is a project: clients subscribe to `project:<projectId>`. */
export const projectRoom = (projectId: string) => `project:${projectId}`;

export interface RealtimeEvents {
  "project.progress": { projectId: string; progress: number; status: string };
  "scene.ready": { projectId: string; sceneId: string; index: number };
  "shot.ready": { projectId: string; sceneId: string; shotId: string; thumbnailKey?: string };
  "render.progress": { projectId: string; renderJobId?: string; progress: number };
  "film.ready": { projectId: string; filmId: string; mp4Key: string; hlsKey?: string };
  "error": { projectId: string; scope: string; id?: string; message: string };
}

export type RealtimeEventName = keyof RealtimeEvents;

/** Envelope published on the Redis channel. */
export interface RealtimeEnvelope<E extends RealtimeEventName = RealtimeEventName> {
  room: string;
  event: E;
  data: RealtimeEvents[E];
}
