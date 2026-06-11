"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { getSupabase } from "../lib/supabase";
import { PLANS, TOPUPS, msToCredits } from "../lib/plans";

/**
 * Pricing (docs/33) — plan grid + credit top-ups, wired to the
 * stripe-checkout edge function. Until Stripe keys are configured the
 * function answers 503 and we surface "billing isn't enabled yet" honestly.
 */
export function PricingPage() {
  const { user, profile } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function checkout(body: { plan?: string; topup?: string }) {
    const sb = getSupabase();
    if (!sb || !user) {
      setNotice("Sign in first — your plan attaches to your account.");
      return;
    }
    setBusy(body.plan ?? body.topup ?? null);
    setNotice(null);
    try {
      const { data: session } = await sb.auth.getSession();
      const token = session?.session?.access_token;
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const res = await fetch(`${base}/functions/v1/stripe-checkout`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...body, returnUrl: window.location.href.split("?")[0] }),
      });
      const out = (await res.json()) as { url?: string; error?: string };
      if (out.url) {
        window.location.href = out.url;
      } else {
        setNotice(out.error ?? "Checkout failed");
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setBusy(null);
    }
  }

  const credits = profile ? msToCredits(profile.creditsMs) : null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-semibold">Plans for every studio</h1>
        <p className="mt-2 text-sm text-white/55">
          One credit meter for everything — films, dubbing, voices, avatars, publishing.
        </p>
        {credits !== null && (
          <p className="mt-2 text-xs text-white/45">
            Your balance: <span className="font-semibold text-white">{credits.toLocaleString()} credits</span>
            {profile && <> · current plan: <span className="font-semibold text-white">{profile.tier}</span></>}
          </p>
        )}
        {notice && <p className="mx-auto mt-3 max-w-md rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">{notice}</p>}
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {PLANS.map((p) => {
          const current = profile?.tier === p.tier;
          return (
            <div
              key={p.tier}
              className={`flex flex-col rounded-2xl border p-5 ${
                p.highlight ? "border-white/40 bg-white/[0.06]" : "border-white/10 bg-white/[0.02]"
              }`}
            >
              {p.highlight && (
                <div className="mb-2 self-start rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
                  Most popular
                </div>
              )}
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <p className="text-xs text-white/50">{p.blurb}</p>
              <div className="mt-3">
                <span className="text-3xl font-bold">${p.priceMonthly}</span>
                <span className="text-sm text-white/45">/mo</span>
              </div>
              <ul className="mt-4 flex-1 space-y-1.5 text-xs text-white/65">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-1.5">
                    <span className="text-emerald-300">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {current ? (
                <div className="mt-4 rounded-lg border border-emerald-400/40 px-4 py-2.5 text-center text-sm font-medium text-emerald-300">
                  Your plan
                </div>
              ) : p.tier === "FREE" ? (
                <div className="mt-4 rounded-lg border border-white/15 px-4 py-2.5 text-center text-sm text-white/50">
                  Included at signup
                </div>
              ) : (
                <button
                  onClick={() => checkout({ plan: p.tier })}
                  disabled={busy !== null}
                  className={`mt-4 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-40 ${
                    p.highlight ? "bg-white text-black hover:bg-white/90" : "border border-white/20 hover:bg-white/5"
                  }`}
                >
                  {busy === p.tier ? "Opening checkout…" : p.cta}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-center text-sm font-semibold text-white/70">Need more? Top up any plan.</h2>
        <div className="mx-auto grid max-w-2xl gap-3 sm:grid-cols-3">
          {TOPUPS.map((t) => (
            <button
              key={t.id}
              onClick={() => checkout({ topup: t.id })}
              disabled={busy !== null}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center transition hover:border-white/30 disabled:opacity-40"
            >
              <div className="text-lg font-semibold">{t.credits.toLocaleString()} cr</div>
              <div className="text-sm text-white/50">${t.price}</div>
            </button>
          ))}
        </div>
        <p className="mt-6 text-center text-[11px] text-white/35">
          Annual billing −20% (contact us) · credits roll over 90 days on paid plans · failed generations are
          auto-recovered, never double-billed.
        </p>
      </div>

      <div className="mx-auto mt-14 max-w-3xl">
        <h2 className="mb-4 text-center text-sm font-semibold text-white/70">Questions, answered</h2>
        <div className="space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-white/80 transition group-open:text-white">
                {f.q}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

const FAQ = [
  {
    q: "What exactly is a credit?",
    a: "One credit ≈ $0.01 of generation. Every action shows its credit price before you run it, and you're only charged for what actually completes — failed generations auto-recover at no extra cost.",
  },
  {
    q: "What's the difference between Standard and Cinematic films?",
    a: "Standard renders on our own GPUs with open-source models — great for drafts and budget runs. Cinematic routes every shot to frontier video models (Kling-class): noticeably better motion and detail, faster too, at a higher credit price.",
  },
  {
    q: "Do unused credits expire?",
    a: "On paid plans credits roll over for 90 days. Top-up packs follow the same rule. The free trial grant is one-time.",
  },
  {
    q: "Can my films really speak Igbo, Lingala or Pidgin?",
    a: "Yes — dubbing covers 20 languages including ones most platforms skip. Translation runs on a frontier language model; voice quality is strongest in the majors and steadily improving in the rest.",
  },
  {
    q: "Who owns what I make?",
    a: "You do. Films, voices and avatars you create are yours to publish and sell. Voices you offer to the community are licensed under the terms you set, and you keep 80% (85% on Agency).",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancelling stops future billing immediately; credits you've already received keep working until used or expired.",
  },
];
