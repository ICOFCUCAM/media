// Stripe Checkout session factory (docs/33). Called by the web app with the
// user's JWT; returns { url } to redirect to. Plans use inline subscription
// price_data (no Stripe dashboard setup needed); top-ups are one-time
// payments. Until STRIPE_SECRET_KEY is configured this responds 503 with a
// clear message — the UI shows "billing not enabled yet" instead of breaking.
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

// Mirrors apps/web/lib/plans.ts (keep in sync).
const CREDIT_MS = 1500;
const PLANS: Record<string, { price: number; credits: number; name: string }> = {
  CREATOR: { price: 19, credits: 2500, name: "Cineforge Creator" },
  STUDIO: { price: 59, credits: 9000, name: "Cineforge Studio" },
  AGENCY: { price: 99, credits: 18000, name: "Cineforge Agency" },
  ENTERPRISE: { price: 499, credits: 50000, name: "Cineforge Enterprise" },
};
const TOPUPS: Record<string, { price: number; credits: number }> = {
  "pack-1k": { price: 12, credits: 1000 },
  "pack-5k": { price: 50, credits: 5000 },
  "pack-20k": { price: 160, credits: 20000 },
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ error: "Billing isn't enabled yet (STRIPE_SECRET_KEY not configured)." }, 503);

  // Identify the signed-in user from their JWT.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return json({ error: "Sign in first." }, 401);

  const { plan, topup, returnUrl } = (await req.json().catch(() => ({}))) as {
    plan?: string;
    topup?: string;
    returnUrl?: string;
  };
  const back = returnUrl ?? "https://cineforge.app/pricing";
  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });

  try {
    if (plan && PLANS[plan]) {
      const p = PLANS[plan]!;
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: user.email ?? undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              recurring: { interval: "month" },
              unit_amount: p.price * 100,
              product_data: { name: p.name, description: `${p.credits.toLocaleString()} credits / month` },
            },
          },
        ],
        metadata: { user_id: user.id, plan, credits: String(p.credits) },
        subscription_data: { metadata: { user_id: user.id, plan, credits: String(p.credits) } },
        success_url: `${back}?status=success`,
        cancel_url: `${back}?status=cancelled`,
      });
      return json({ url: session.url });
    }

    if (topup && TOPUPS[topup]) {
      const t = TOPUPS[topup]!;
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: user.email ?? undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: t.price * 100,
              product_data: { name: `Cineforge credits — ${t.credits.toLocaleString()}` },
            },
          },
        ],
        metadata: { user_id: user.id, credits: String(t.credits) },
        success_url: `${back}?status=success`,
        cancel_url: `${back}?status=cancelled`,
      });
      return json({ url: session.url });
    }

    return json({ error: "Unknown plan or top-up." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Stripe error" }, 500);
  }
});
