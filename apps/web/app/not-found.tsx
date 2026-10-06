import Link from "next/link";

export const metadata = { title: "Not in the archive — Cineforge" };

/** 404 — in the homepage's black, with the way back into the studio. */
export default function NotFound() {
  return (
    <main className="cf-dark flex min-h-screen flex-col justify-between px-[6vw] py-10">
      <Link href="/" className="font-display text-[18px] font-extrabold tracking-[-0.04em]">
        CINEFORGE
      </Link>
      <div>
        <div className="cf-eyebrow mb-6">404 / Not in the archive</div>
        <h1 className="cf-display text-[clamp(56px,10vw,170px)] leading-[0.84]">
          Cut from
          <br />
          <em>the film.</em>
        </h1>
        <p className="mt-8 max-w-md text-[15px] leading-[1.75] text-cf-muted">This page does not exist — or it was moved when the studio was rebuilt.</p>
        <div className="mt-9 flex flex-wrap gap-2">
          <Link href="/create" className="cf-btn-accent">
            Enter the studio
          </Link>
          <Link href="/projects" className="cf-btn-line">
            The archive
          </Link>
        </div>
      </div>
      <span className="cf-label">© Cineforge</span>
    </main>
  );
}
