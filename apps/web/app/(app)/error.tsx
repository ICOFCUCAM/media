"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Studio error boundary — a room failed to render. The shell (rail,
 * navigator, account) stays up; the room can be retried in place.
 */
export default function StudioError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <div className="border-b border-cf-line pb-14">
        <div className="cf-eyebrow mb-6">Production stopped</div>
        <h1 className="cf-display text-[clamp(48px,7vw,110px)] leading-[0.86]">
          This room
          <br />
          <em>did not open.</em>
        </h1>
        <p role="alert" className="mt-8 max-w-xl border-l-2 border-cf-danger pl-4 text-[13px] leading-relaxed text-cf-danger">
          {error.message || "Something went wrong while rendering this page."}
          {error.digest && <span className="cf-label mt-2 block text-cf-muted">Reference {error.digest}</span>}
        </p>
        <div className="mt-9 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="cf-btn-ink">
            Try again
          </button>
          <Link href="/projects" className="cf-btn-line">
            Back to the archive
          </Link>
        </div>
      </div>
    </div>
  );
}
