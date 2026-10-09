import type { Metadata } from "next";
import "./ads-studio.css";
import { AdsStudio } from "./AdsStudio";

// CineForge Ads Studio — a standalone product page. It carries no studio
// chrome so it can also be served at the root of its own domain
// (ADS_STUDIO_HOSTS, see middleware.ts and docs/47).
export const metadata: Metadata = {
  title: "CineForge Ad Studio — Website to Advertisement",
  description:
    "Turn a website, product page or creative brief into a complete advertisement — planned scene by scene, powered by your brand assets, generated with CineForge media engines, and assembled into one polished film.",
  openGraph: {
    title: "CineForge Ad Studio — Website to Advertisement",
    description: "From website to finished commercial. Your website. One unforgettable ad.",
    type: "website",
  },
};

export default function AdsStudioPage() {
  return <AdsStudio />;
}
