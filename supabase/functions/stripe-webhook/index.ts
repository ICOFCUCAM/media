// Stripe webhook → fulfillment (docs/33). Stripe calls this on checkout
// completion and on every subscription renewal; we set the user's tier and
// grant credits (credits × CREDIT_MS onto users.credits_ms). Uses the
// service role (RLS bypass) — Stripe's signature is the auth.
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const CREDIT_MS = 1500;

Deno.serve(async (req) => {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!key || !whSecret) return new Response("billing not configured", { status: 503 });

  const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), sig, whSecret);
  } catch (e) {
    return new Response(`signature verification failed: ${e instanceof Error ? e.message : e}`, { status: 400 });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  /** Grant credits (and optionally a tier) to a user — additive, never resets. */
  async function grant(userId: string, credits: number, tier?: string, stripeCustomer?: string) {
    const { data: u } = await admin.from("users").select("credits_ms").eq("id", userId).single();
    const next = (u?.credits_ms ?? 0) + credits * CREDIT_MS;
    await admin
      .from("users")
      .update({ credits_ms: next, ...(tier ? { tier } : {}), ...(stripeCustomer ? { stripe_id: stripeCustomer } : {}) })
      .eq("id", userId);
    console.log(`[stripe] granted ${credits} credits to ${userId}${tier ? ` (tier ${tier})` : ""}`);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = s.metadata?.user_id;
      const credits = Number(s.metadata?.credits ?? 0);
      if (userId && credits > 0) {
        await grant(userId, credits, s.metadata?.plan, typeof s.customer === "string" ? s.customer : undefined);
      }
      break;
    }
    case "invoice.paid": {
      // Subscription renewals (the FIRST invoice is covered by checkout.session.completed
      // above — skip it to avoid double-granting).
      const inv = event.data.object as Stripe.Invoice;
      if (inv.billing_reason === "subscription_cycle") {
        const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          const userId = sub.metadata?.user_id;
          const credits = Number(sub.metadata?.credits ?? 0);
          if (userId && credits > 0) await grant(userId, credits, sub.metadata?.plan);
        }
      }
      break;
    }
    case "customer.subscription.deleted": {
      // Cancelled: drop to FREE (credits already granted stay until used).
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      if (userId) {
        await admin.from("users").update({ tier: "FREE" }).eq("id", userId);
        console.log(`[stripe] subscription cancelled -> ${userId} back to FREE`);
      }
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "content-type": "application/json" } });
});
