// Stripe webhook → fulfillment (docs/33). Stripe calls this on checkout
// completion and on every subscription renewal; we set the user's tier and
// grant credits (credits × CREDIT_MS onto users.credits_ms). Uses the
// service role (RLS bypass) — Stripe's signature is the auth.
//
// Every balance change goes through public.apply_stripe_grant (migration
// 0044): one transaction claims the event id and increments the balance, so
// a retried or replayed event is applied once, and a worker debit landing at
// the same moment is never overwritten. A failed grant returns 500 so Stripe
// retries it.
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

  /** Apply this event once: credits (additive) and optionally tier / customer. */
  async function grant(userId: string, credits: number, tier?: string, stripeCustomer?: string) {
    const { data: applied, error } = await admin.rpc("apply_stripe_grant", {
      p_event_id: event.id,
      p_type: event.type,
      p_user: userId,
      p_credit_ms: Math.round(credits * CREDIT_MS),
      p_tier: tier ?? null,
      p_stripe_id: stripeCustomer ?? null,
    });
    if (error) throw new Error(`grant failed for ${event.id}: ${error.message}`);
    console.log(applied
      ? `[stripe] ${event.id}: granted ${credits} credits to ${userId}${tier ? ` (tier ${tier})` : ""}`
      : `[stripe] ${event.id}: already applied — skipped`);
  }

  try {
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
        if (userId) await grant(userId, 0, "FREE");
        break;
      }
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return new Response("fulfillment failed; Stripe will retry", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "content-type": "application/json" } });
});
