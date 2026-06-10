"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { getSupabase } from "../lib/supabase";
import { signedUrl } from "../lib/storyboard";

/** Generated media gallery — the actual stills + clips your films produced. */
export function GeneratedMedia() {
  const { user } = useAuth();
  const [shots, setShots] = useState<{ id: string; still?: string; clip?: string; title: string }[] | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !user) return;
    void (async () => {
      const { data: scenes } = await sb.from("scenes").select("id,projects(title)").limit(300);
      const titles = new Map((scenes ?? []).map((s) => [s.id, (s as { projects?: { title?: string } }).projects?.title ?? "Untitled"]));
      const ids = (scenes ?? []).map((s) => s.id);
      if (!ids.length) return setShots([]);
      const { data } = await sb
        .from("shots")
        .select("id,scene_id,seed_image_key,video_key,status")
        .in("scene_id", ids)
        .eq("status", "READY")
        .order("created_at", { ascending: false })
        .limit(24);
      const rows = await Promise.all(
        (data ?? []).map(async (s) => ({
          id: s.id,
          title: titles.get(s.scene_id) ?? "Untitled",
          still: s.seed_image_key ? ((await signedUrl(s.seed_image_key)) ?? undefined) : undefined,
          clip: s.video_key ? ((await signedUrl(s.video_key)) ?? undefined) : undefined,
        })),
      );
      setShots(rows.filter((r) => r.still || r.clip));
    })();
  }, [user]);

  if (!user || !shots?.length) return null;
  return (
    <div className="mt-10">
      <h2 className="mb-3 text-sm font-semibold text-white/70">Generated media — latest ready shots</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shots.map((s) => (
          <div key={s.id} className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
            {s.clip ? (
              <video src={s.clip} muted loop playsInline onMouseEnter={(e) => void e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} poster={s.still} className="aspect-video w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.still} alt="" className="aspect-video w-full object-cover" />
            )}
            <div className="truncate px-2.5 py-1.5 text-[11px] text-white/45">{s.title}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-white/30">Hover a clip to preview. Every shot is reusable — remix coming to the storyboard.</p>
    </div>
  );
}
