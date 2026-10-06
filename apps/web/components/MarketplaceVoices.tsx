"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { getSupabase } from "../lib/supabase";
import { EmptyState, Section } from "./cf/primitives";

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

  if (!voices) return null;
  return (
    <Section
      label="Live now · community voices"
      title={voices.length ? `${String(voices.length).padStart(2, "0")} ${voices.length === 1 ? "voice" : "voices"} on the shelf` : "Voices on the shelf"}
      aside={
        <Link href="/library/voices" className="cf-link text-cf-muted hover:text-cf-fg">
          Use one in the Voice Room →
        </Link>
      }
    >
      {voices.length === 0 ? (
        <EmptyState title={<>The shelf is <em>empty.</em></>} hint="Offer a cloned voice from the Voice Room — once approved it appears here for everyone." />
      ) : (
        <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-2 lg:grid-cols-4">
          {voices.map((v, i) => (
            <article key={v.id} className="flex min-h-[170px] flex-col bg-cf-bg p-5">
              <span className="font-mono text-[11px] text-cf-muted">V / {String(i + 1).padStart(3, "0")}</span>
              <h3 className="mt-auto truncate pt-8 font-display font-semibold text-[24px] tracking-[-0.03em]">{v.name}</h3>
              <p className="mt-2 line-clamp-2 text-[11px] text-cf-muted">{v.share_terms || "No terms specified"}</p>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}
