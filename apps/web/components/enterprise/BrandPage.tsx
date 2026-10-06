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
  const { user } = useAuth();
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
            <p><strong>Stored now; applying the branded outro card on final cuts is the next render-engine step.</strong></p>
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
                  className="w-full text-[11px] text-cf-muted file:mr-3 file:border file:border-cf-line file:bg-transparent file:px-3 file:py-2 file:font-mono file:text-[9px] file:uppercase file:tracking-[0.1em] file:text-cf-fg"
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
                <label htmlFor="brand-outro" className="cf-label mb-2 mt-7 block text-cf-fg">Outro line · closes every export</label>
                <input id="brand-outro" value={outro} onChange={(e) => setOutro(e.target.value)} placeholder="A film by Your Studio" className="cf-input font-serif text-[18px]" />
                <div className="mt-8 flex items-center gap-4">
                  <button type="submit" disabled={busy} className="cf-btn-ink">
                    {busy ? "Saving…" : "Save brand kit"}
                  </button>
                  {saved && <Status tone="ok">Saved</Status>}
                </div>
              </Cell>
              <Cell>
                <div className="cf-label">The end card</div>
                <div className="cf-dark mt-8 flex aspect-video flex-col items-center justify-center gap-4 p-6 text-center">
                  {logoUrl ? (
                    /* Plain <img>: a signed, short-lived storage URL. */
                    <img src={logoUrl} alt="Your logo" className="max-h-[38%] max-w-[50%] object-contain" />
                  ) : (
                    <span className="cf-label">No logo yet</span>
                  )}
                  <span className="font-serif text-[20px] tracking-[-0.02em]">{outro || "A film by Your Studio"}</span>
                  <span className="flex gap-2" aria-hidden>
                    <i className="block h-2 w-10" style={{ background: primary }} />
                    <i className="block h-2 w-10" style={{ background: secondary }} />
                  </span>
                </div>
                <p className="cf-label mt-3">A preview of the kit — not yet stamped onto renders.</p>
              </Cell>
            </Split>
          </form>
        </StudioGate>
      </div>
    </div>
  );
}
