import Link from "next/link";

/** Marketing header for the public homepage. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0a0a0f]/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Cineforge
        </Link>
        <div className="flex items-center gap-5 text-sm text-white/70">
          <Link href="/create/film" className="transition hover:text-white">Studio</Link>
          <Link href="/marketplace" className="transition hover:text-white">Marketplace</Link>
          <Link href="/publish" className="transition hover:text-white">Publish</Link>
          <Link href="/pricing" className="transition hover:text-white">Pricing</Link>
          <Link
            href="/create/film"
            className="rounded-lg bg-white px-3.5 py-1.5 font-medium text-black transition hover:bg-white/90"
          >
            Open Studio
          </Link>
        </div>
      </nav>
    </header>
  );
}
