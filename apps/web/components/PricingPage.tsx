"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { getSupabase } from "../lib/supabase";
import { PLANS, TOPUPS, msToCredits } from "../lib/plans";
import { PageHeader, Section } from "./cf/primitives";

/**
 * Access (docs/design/access-pricing.html). Pricing (docs/33) — plan grid + credit top-ups, wired to the
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
    <div className="mx-auto w-full max-w-[1500px] px-5 py-10 sm:px-[6vw] sm:py-14">
      <PageHeader
        eyebrow="Account / Access"
        title={<>Enter the<br /><em>studio.</em></>}
        copy={
          <>
            <p>One credit meter for everything — films, dubbing, voices, avatars and publishing.</p>
            <p><strong>Start with what you need. Expand into the complete production environment as the work grows.</strong></p>
          </>
        }
        status={profile ? { tone: "live", label: `${profile.tier} plan · ${credits?.toLocaleString()} credits` } : { tone: "idle", label: "Sign in to see your standing" }}
      />

      {notice && (
        <p role="status" className="mt-10 border-l-2 border-cf-warn bg-cf-soft px-5 py-4 text-[13px]">
          <span className="cf-label mr-2 text-cf-warn">Billing</span>
          {notice}
        </p>
      )}

      {profile && (
        <Section label="Your standing" title="The account.">
          <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-3">
            {[
              ["Plan", profile.tier.charAt(0) + profile.tier.slice(1).toLowerCase()],
              ["Credits", credits!.toLocaleString()],
              ["Role", profile.role === "ADMIN" ? "Administrator" : "Creator"],
            ].map(([k, v]) => (
              <div key={k} className="bg-cf-bg p-6">
                <div className="cf-label">{k}</div>
                <div className="cf-display mt-6 text-[44px] leading-none">{v}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section label="Plans" title="Choose the room.">
        <div className="grid border-l border-t border-cf-line md:grid-cols-2 xl:grid-cols-5">
          {PLANS.map((p) => {
            const current = profile?.tier === p.tier;
            return (
              <article
                key={p.tier}
                className={`flex min-h-[520px] flex-col border-b border-r border-cf-line p-6 ${p.highlight ? "bg-cf-inverse text-cf-on-inverse" : "bg-cf-bg"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.12em]">{p.name}</h2>
                  {current ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-cf-ok">Your plan</span>
                  ) : (
                    p.highlight && <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-cf-accent">Most chosen</span>
                  )}
                </div>
                <div className="mt-9 font-serif text-[46px] leading-none tracking-[-0.05em]">
                  ${p.priceMonthly}
                  <span className="ml-1 font-sans text-[12px] tracking-normal opacity-50">/mo</span>
                </div>
                <p className="mt-4 text-[13px] opacity-60">{p.blurb}</p>
                <ul className="mt-7 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="text-[11px] leading-snug opacity-75">
                      {f}
                    </li>
                  ))}
                </ul>
                {current ? (
                  <div className="cf-btn mt-8 border border-current opacity-60">Current plan</div>
                ) : p.tier === "FREE" ? (
                  <div className="cf-btn mt-8 border border-current opacity-50">Included at signup</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => checkout({ plan: p.tier })}
                    disabled={busy !== null}
                    className={`mt-8 ${p.highlight ? "cf-btn-accent" : "cf-btn border border-cf-fg hover:bg-cf-inverse hover:text-cf-on-inverse"}`}
                  >
                    {busy === p.tier ? "Opening checkout…" : p.cta}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </Section>

      <Section label="Top-ups" title="Need more? Top up any plan.">
        <div className="grid gap-px border border-cf-line bg-cf-line sm:grid-cols-3">
          {TOPUPS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => checkout({ topup: t.id })}
              disabled={busy !== null}
              className="group flex min-h-[150px] flex-col bg-cf-bg p-6 text-left transition hover:bg-cf-soft disabled:opacity-40"
            >
              <span className="cf-label">{busy === t.id ? "Opening checkout…" : "Credit pack"}</span>
              <span className="cf-display mt-auto text-[40px] leading-none">{t.credits.toLocaleString()}</span>
              <span className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.1em]">
                <span className="text-cf-muted">credits</span>
                <span>${t.price}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="cf-label mt-4 leading-relaxed">
          Annual billing −20% (contact us) · credits roll over 90 days on paid plans · failed generations are auto-recovered, never double-billed.
        </p>
      </Section>

      <Section label="Questions" title="Answered.">
        <div className="border-t border-cf-fg">
          {FAQ.map((f, i) => (
            <details key={f.q} className="group border-b border-cf-line">
              <summary className="grid cursor-pointer list-none grid-cols-[44px_1fr_auto] items-center gap-4 py-5">
                <span className="font-mono text-[9px] text-cf-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-serif text-[20px] tracking-[-0.02em]">{f.q}</span>
                <span className="cf-label group-open:hidden">+</span>
                <span className="cf-label hidden group-open:inline">−</span>
              </summary>
              <p className="max-w-3xl pb-6 pl-[60px] text-[13px] leading-relaxed text-cf-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>
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
