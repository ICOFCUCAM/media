# 34 — Stripe Activation Runbook (15 minutes, one person)

Everything is deployed and waiting on two secrets. Test mode first is
recommended — identical flow, fake card `4242 4242 4242 4242`.

## Steps

1. **Create the account** — https://dashboard.stripe.com/register
2. **Get the secret key** — Dashboard → Developers → API keys → copy
   `sk_test_…` (test mode) or `sk_live_…` (live).
3. **Set it in Supabase** — https://supabase.com/dashboard/project/trazlydqhfvvawcvfhpw/settings/functions
   → Add secret: `STRIPE_SECRET_KEY` = the key.
4. **Create the webhook** — Stripe Dashboard → Developers → Webhooks →
   Add endpoint:
   - URL: `https://trazlydqhfvvawcvfhpw.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `invoice.paid`,
     `customer.subscription.deleted`
   - Copy the **Signing secret** (`whsec_…`).
5. **Set it in Supabase** — same secrets page: `STRIPE_WEBHOOK_SECRET` = the
   signing secret.
6. **Test** — open /pricing signed in → "Go Creator" → pay with
   `4242 4242 4242 4242`, any future date, any CVC → you land back on
   /pricing and within seconds your tier shows CREATOR and the sidebar
   credits jump by 2,500.

## What happens automatically after that

- Plan checkout → tier set + credits granted (stripe-webhook)
- Monthly renewals → fresh credits (invoice.paid, no double-grant on the
  first invoice)
- Cancellation → back to FREE; remaining credits keep working
- Top-up packs → one-time credit grants

Switch test → live by replacing both secrets with live-mode values and
re-creating the webhook in live mode. No code changes.
