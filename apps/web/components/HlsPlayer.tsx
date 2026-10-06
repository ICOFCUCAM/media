"use client";

import { useEffect, useRef } from "react";

/**
 * Plays the final film. HLS (.m3u8) via hls.js (or native on Safari), or a
 * direct MP4. hls.js is dynamically imported so it stays out of the SSR bundle.
 */
export function HlsPlayer({ src, poster }: { src: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return;

    const isHls = src.includes(".m3u8");
    if (!isHls) {
      video.src = src;
      return;
    }
    // Native HLS (Safari/iOS).
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }
    let hls: { destroy: () => void } | undefined;
    let active = true;
    import("hls.js").then(({ default: Hls }) => {
      if (!active || !video) return;
      if (Hls.isSupported()) {
        const instance = new Hls({ enableWorker: true });
        instance.loadSource(src);
        instance.attachMedia(video);
        hls = instance;
      } else {
        video.src = src;
      }
    });
    return () => {
      active = false;
      hls?.destroy();
    };
  }, [src]);

  return (
    <video
      ref={ref}
      controls
      playsInline
      poster={poster}
      className="aspect-video w-full bg-black"
    />
  );
}
