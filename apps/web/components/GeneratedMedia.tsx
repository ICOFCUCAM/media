"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { getSupabase } from "../lib/supabase";
import { signedUrl } from "../lib/storyboard";
import { Section } from "./cf/primitives";

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
    <Section label="Generated media" title="Latest ready shots">
      <div className="grid grid-cols-2 gap-px border border-cf-line bg-cf-line sm:grid-cols-3 lg:grid-cols-4">
        {shots.map((s) => (
          <figure key={s.id} className="bg-cf-bg">
            {s.clip ? (
              <video
                src={s.clip}
                muted
                loop
                playsInline
                onMouseEnter={(e) => void e.currentTarget.play()}
                onMouseLeave={(e) => e.currentTarget.pause()}
                onFocus={(e) => void e.currentTarget.play()}
                onBlur={(e) => e.currentTarget.pause()}
                tabIndex={0}
                poster={s.still}
                aria-label={`Clip from ${s.title}`}
                className="aspect-video w-full bg-black object-cover"
              />
            ) : (
              /* Plain <img>: a signed, short-lived storage URL. */
              <img src={s.still} alt={`Still from ${s.title}`} className="aspect-video w-full object-cover" />
            )}
            <figcaption className="cf-label truncate px-3 py-2.5">{s.title}</figcaption>
          </figure>
        ))}
      </div>
      <p className="cf-label mt-3">Hover or focus a clip to preview it.</p>
    </Section>
  );
}
