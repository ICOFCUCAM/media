"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Marketing header — glass nav that condenses + glows on scroll. */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 border-b transition-all duration-300 ${
        scrolled ? "border-white/10 bg-[#0a0a0f]/80 backdrop-blur-xl" : "border-transparent bg-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="group flex items-center gap-2 font-semibold tracking-tight">
          <span className="relative flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[11px] text-white shadow-[0_0_14px_-2px_rgba(165,180,252,0.8)] transition group-hover:shadow-[0_0_20px_-2px_rgba(240,171,252,0.9)]">
            ◢
          </span>
          Cineforge
        </Link>
        <div className="flex items-center gap-1 text-sm text-white/70 sm:gap-5">
          {[
            { href: "/create/film", label: "Studio" },
            { href: "/library/voices", label: "Voice Lab" },
            { href: "/marketplace", label: "Marketplace" },
            { href: "/pricing", label: "Pricing" },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="hidden px-2 py-1 transition hover:text-white sm:inline">
              {l.label}
            </Link>
          ))}
          <Link
            href="/create/film"
            className="rounded-lg bg-white px-3.5 py-1.5 font-medium text-black shadow-[0_0_24px_-8px_rgba(255,255,255,0.6)] transition hover:shadow-[0_0_36px_-8px_rgba(165,180,252,0.8)]"
          >
            Open Studio
          </Link>
        </div>
      </nav>
    </header>
  );
}
