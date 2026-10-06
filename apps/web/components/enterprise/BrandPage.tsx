"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import { StudioGate } from "../cf/StudioGate";
import { Cell, PageHeader, Split, Status } from "../cf/primitives";
import { getSupabase } from "../../lib/supabase";
import { signedUrl } from "../../lib/storyboard";

const BUCKET = "cineforge-assets";

/** Brand kit — logo, palette, outro line. Stored per user; the render
 *  engine picks it up for white-label outros (Agency+). */
export function BrandPage() {
  const { user, profile } = useAuth();
  // Mirrors render.processor: Agency, Enterprise and admins get the branded outro.
  const eligible = !!profile && (profile.role === "ADMIN" || profile.tier === "AGENCY" || profile.tier === "ENTERPRISE");
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
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="Enterprise / Brand assets"
        title={<>The house<br /><em>signature.</em></>}
        copy={
          <>
            <p>Your logo, palette and outro line — the identity that closes white-label exports on Agency and Enterprise plans.</p>
            <p><strong>On Agency and Enterprise plans the render worker closes every final cut with this card — logo, primary colour and outro line.</strong></p>
          </>
        }
        status={{ tone: "idle", label: "Brand kit" }}
      />
      <div className="pt-12">
        <StudioGate signIn="Sign in to manage your brand" what="Brand kits">
          <form onSubmit={onSave}>
            <Split>
              <Cell>
                <div className="cf-label">The kit</div>
                <label htmlFor="brand-logo" className="cf-label mb-2 mt-8 block text-cf-fg">
                  Logo · PNG / SVG, transparent works best
                </label>
                <input
                  id="brand-logo"
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="w-full"
                />
                <div className="mt-7 grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="cf-label mb-2 block text-cf-fg">Primary</span>
                    <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-11 w-full cursor-pointer border border-cf-line bg-transparent" />
                  </label>
                  <label className="block">
                    <span className="cf-label mb-2 block text-cf-fg">Secondary</span>
                    <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="h-11 w-full cursor-pointer border border-cf-line bg-transparent" />
                  </label>
                </div>
                <label htmlFor="brand-outro" className="cf-label mb-2 mt-7 block text-cf-fg">Outro line · closes every final cut</label>
                <input id="brand-outro" value={outro} onChange={(e) => setOutro(e.target.value)} placeholder="A film by Your Studio" className="cf-input font-display font-semibold text-[18px]" />
                <div className="mt-8 flex items-center gap-4">
                  <button type="submit" disabled={busy} className="cf-btn-ink">
                    {busy ? "Saving…" : "Save brand kit"}
                  </button>
                  {saved && <Status tone="ok">Saved</Status>}
                </div>
              </Cell>
              <Cell>
                <div className="cf-label">The end card · as rendered</div>
                {/* Mirrors the render engine: primary colour at 25% over black, centred logo, the line in the lower fifth. */}
                <div className="relative mt-8 aspect-video overflow-hidden bg-black text-white">
                  <div className="absolute inset-0" style={{ background: primary, opacity: 0.25 }} aria-hidden />
                  <div className="absolute inset-0 flex items-center justify-center">
                    {logoUrl ? (
                      /* Plain <img>: a signed, short-lived storage URL. */
                      <img src={logoUrl} alt="Your logo" className="w-1/4 object-contain" />
                    ) : (
                      <span className="font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-white/50">No logo yet</span>
                    )}
                  </div>
                  {outro.trim() && <span className="absolute inset-x-6 bottom-[16%] text-center font-sans text-[15px]">{outro}</span>}
                </div>
                <p className="cf-label mt-3 leading-relaxed">
                  {eligible
                    ? "Your plan stamps this card on every final cut."
                    : "Saved to your account — stamped on renders from the Agency plan up."}{" "}
                  The secondary colour is kept for your own reference.
                </p>
              </Cell>
            </Split>
          </form>
        </StudioGate>
      </div>
    </div>
  );
}
