import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Cineforge — The 2030 AI Film Engine",
    template: "%s · Cineforge",
  },
  description:
    "A sentence in, a cinematic film out. Generate narrated films, dub them into 20 languages, clone your voice, put your face on camera, and publish everywhere — one studio in your browser.",
  keywords: ["AI film generation", "text to video", "AI dubbing", "voice cloning", "talking avatar", "Cineforge"],
  openGraph: {
    title: "Cineforge — The 2030 AI Film Engine",
    description: "A sentence in, a cinematic film out. Films, 20-language dubbing, voice cloning, avatars, one-tap publishing.",
    type: "website",
  },
  themeColor: "#0a0a0f",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-fuchsia-400/30 selection:text-white">{children}</body>
    </html>
  );
}
