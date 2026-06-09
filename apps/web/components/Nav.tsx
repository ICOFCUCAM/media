import Link from "next/link";
import { IS_LIVE } from "../lib/system";

export function Nav() {
  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0a0a0f]/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Cineforge
        </Link>
        <div className="flex items-center gap-5 text-sm text-white/70">
          <Link href="/studio" className="transition hover:text-white">
            Studio
          </Link>
          <Link href="/system" className="transition hover:text-white">
            System
          </Link>
          <a
            href="https://github.com/ICOFCUCAM/media"
            className="transition hover:text-white"
          >
            Code
          </a>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${
              IS_LIVE
                ? "border-emerald-400/40 text-emerald-300"
                : "border-amber-400/40 text-amber-300"
            }`}
            title={IS_LIVE ? "Connected to a live API" : "Demo mode — set NEXT_PUBLIC_API_URL to go live"}
          >
            {IS_LIVE ? "Live API" : "Demo"}
          </span>
        </div>
      </nav>
    </header>
  );
}
