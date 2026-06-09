/**
 * Single source of truth for queue names and job payloads.
 * Imported by the API (producers) and the worker (consumers) so the contract
 * can never drift. See docs/13-queues.md.
 */
export const QUEUES = {
    film: "film-queue",
    scene: "scene-queue",
    video: "video-queue",
    audio: "audio-queue",
    render: "render-queue",
};
