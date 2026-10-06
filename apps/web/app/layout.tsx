import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Cineforge — The Film Production System",
    // Studio pages already name themselves "<Room> — Cineforge".
    template: "%s",
  },
  description:
    "A complete production environment for films, series, trailers, adverts, shorts and music videos — from the first idea to the finished release, dubbed into 20 languages and published everywhere.",
  keywords: ["film production", "AI film", "series", "dubbing", "voice cloning", "Cineforge"],
  openGraph: {
    title: "Cineforge — The Film Production System",
    description: "From the first idea to the finished release: one continuous production system for films, series, trailers and shorts.",
    type: "website",
  },
};

export const viewport = { themeColor: "#080808" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
