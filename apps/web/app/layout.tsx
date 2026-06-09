import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cineforge — Your AI Film Studio",
  description:
    "Create films, series, trailers and shorts from a single prompt. Publish everywhere and monetize — a studio in your browser.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
