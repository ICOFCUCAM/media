"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { getSupabase } from "../lib/supabase";

/** The live storefront shelf: community voices approved for reuse. */
export function MarketplaceVoices() {
  const { user } = useAuth();
  const [voices, setVoices] = useState<{ id: string; name: string; share_terms: string | null }[] | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    void sb
      .from("voices")
      .select("id,name,share_terms")
      .eq("share_status", "APPROVED")
      .eq("status", "READY")
      .limit(12)
      .then(({ data }) => setVoices((data as { id: string; name: string; share_terms: string | null }[]) ?? []));
  }, [user]);

  if (!voices?.length) return null;
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-white/70">Community voices — live now</h2>
        <Link href="/library/voices" className="text-xs text-white/40 hover:text-white">
          Use one in the Voice Lab →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {voices.map((v) => (
          <div key={v.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400/40 to-fuchsia-400/30 text-lg">🎙</div>
            <div className="truncate font-medium">{v.name}</div>
            <p className="mt-1 line-clamp-2 text-xs text-white/45">{v.share_terms || "No terms specified"}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
