import { WorkspacePage, CardGrid } from "../../../../components/WorkspacePage";

export const metadata = { title: "Streaming — Cineforge" };

export default function StreamingPage() {
  return (
    <WorkspacePage
      title="Streaming"
      subtitle="Host your films and series with adaptive HLS playback and your own channel page."
    >
      <CardGrid
        items={[
          { title: "Channel page", blurb: "A branded, shareable home for all your titles." },
          { title: "Adaptive streaming", blurb: "HLS ladders so every title plays smoothly on any connection." },
          { title: "Access control", blurb: "Public, unlisted, paid or members-only — per title." },
        ]}
      />
    </WorkspacePage>
  );
}
