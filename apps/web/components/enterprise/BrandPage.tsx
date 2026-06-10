"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import { AuthCard } from "../AuthCard";
import { getSupabase } from "../../lib/supabase";
import { signedUrl } from "../../lib/storyboard";

const BUCKET = "cineforge-assets";

/** Brand kit — logo, palette, outro line. Stored per user; the render
 *  engine picks it up for white-label outros (Agency+). */
export function BrandPage() {
  const { enabled, loading, user } = useAuth();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [primary, setPrimary] = useState("#6366f1");
  const [secondary, setSecondary] = useState("#d946ef");
  const [outro, setOutro] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !user) return;
    void sb
      .from("brand_kits")
      .select()
      .eq("user_id", user.id)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data) return;
        setPrimary(data.primary_color);
        setSecondary(data.secondary_color);
        setOutro(data.outro_text ?? "");
        if (data.logo_key) setLogoUrl(await signedUrl(data.logo_key));
      });
  }, [user]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || !user || busy) return;
    setBusy(true);
    setSaved(false);
    try {
      let logo_key: string | undefined;
      const file = fileRef.current?.files?.[0];
      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "png";
        logo_key = `brand/${user.id}/logo.${ext}`;
        const up = await sb.storage.from(BUCKET).upload(logo_key, file, { upsert: true });
        if (up.error) throw new Error(up.error.message);
        setLogoUrl(await signedUrl(logo_key));
      }
      await sb.from("brand_kits").upsert({
        user_id: user.id,
        primary_color: primary,
        secondary_color: secondary,
        outro_text: outro || null,
        ...(logo_key ? { logo_key } : {}),
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Brand Assets</h1>
        <p className="mt-1 text-sm text-white/55">Your logo, palette and outro — applied to white-label exports on Agency and Enterprise plans.</p>
      </header>

      {!enabled ? (
        <p className="text-sm text-white/45">Connect Supabase first.</p>
      ) : loading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : !user ? (
        <AuthCard title="Sign in to manage your brand" />
      ) : (
        <form onSubmit={onSave} className="space-y-5 rounded-xl border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center gap-4">
            <div
              className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-white/10"
              style={{ background: `linear-gradient(135deg, ${primary}33, ${secondary}33)` }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="logo" className="h-full w-full object-contain p-2" />
              ) : (
                <span className="text-2xl text-white/30">◎</span>
              )}
            </div>
            <div className="flex-1">
              <label className="text-xs text-white/50">Logo (PNG/SVG, transparent works best)</label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="mt-1 w-full text-xs text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-white/50">Primary color</span>
              <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent" />
            </label>
            <label className="block">
              <span className="text-xs text-white/50">Secondary color</span>
              <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-white/50">Outro line (closes every export)</span>
            <input
              value={outro}
              onChange={(e) => setOutro(e.target.value)}
              placeholder="A film by Your Studio"
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-white/30"
            />
          </label>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy} className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40">
              {busy ? "Saving…" : "Save brand kit"}
            </button>
            {saved && <span className="text-xs text-emerald-300">Saved ✓</span>}
          </div>
          <p className="text-[11px] text-white/35">Render-engine application (branded outro card on final cuts) is the wired next step.</p>
        </form>
      )}
    </div>
  );
}
