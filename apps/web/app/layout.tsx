import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DM_Mono, Inter, Manrope } from "next/font/google";
import "./globals.css";
import { PreviewBuildBadge } from "../components/PreviewBuildBadge";

// Self-hosted at build time by next/font: no runtime request to Google, no
// render-blocking third-party stylesheet, and no failure when it is blocked.
const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono", display: "swap" });

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
  // Preview deployments must never compete with the live site in search.
  ...(process.env.VERCEL_ENV === "preview" ? { robots: { index: false, follow: false } } : {}),
};

export const viewport = { themeColor: "#080808" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable} ${dmMono.variable}`}>
      <body className="antialiased">
        {children}
        <PreviewBuildBadge />
      </body>
    </html>
  );
}
