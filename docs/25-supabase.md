# 25 — Supabase (DB / Auth / Realtime / Storage)

Cineforge uses **Supabase** as the managed backbone for the data plane, and
keeps the compute plane (GPU inference, BullMQ queues, FFmpeg) on **separate
worker services**. Supabase cannot run GPU models or FFmpeg, so the split is:

```
Browser (creator studio, apps/web)
  │  supabase-js: Auth + Postgres (RLS) + Realtime + Storage reads
  ▼
Supabase  ──Postgres Changes──▶  Realtime ──▶ browser (live progress)
  ▲
  │  service-role key (bypasses RLS)
Worker services (apps/worker, apps/gpu-worker)
  •  Director orchestration, BullMQ/Redis queues
  •  GPU dispatch (RunPod) + FFmpeg render
  •  write scenes/shots/render progress back to Supabase
```

## Project

| | |
|---|---|
| Name | `cineforge` |
| Ref | `trazlydqhfvvawcvfhpw` |
| URL | `https://trazlydqhfvvawcvfhpw.supabase.co` |
| Region | `us-east-1` |
| Plan | Free ($0/mo) |

Keys live in `.env.example`. The **publishable** key is browser-safe (all
access is mediated by RLS). The **service-role** key is server-only and must
never reach the browser.

## Schema & migrations

The schema mirrors `packages/db/prisma/schema.prisma` and
`docs/02-database-schema.md`, adapted to Supabase conventions:

- `uuid` primary keys (`gen_random_uuid()`); `public.users.id` references
  `auth.users(id)`.
- snake_case tables/columns; Postgres enums for the status/kind types.
- A `handle_new_user()` trigger mirrors each `auth.users` signup into
  `public.users` (profile + tier/credits/role).
- `set_updated_at()` triggers maintain `updated_at`.

Migrations (idempotent, applied to the live project) are version-controlled in
`packages/db/supabase/migrations/`:

| File | Contents |
|---|---|
| `0001_init_enums_helpers.sql` | extensions (`pgcrypto`, `vector`), enums, trigger fns |
| `0002_init_tables.sql` | all 22 tables, indexes, `updated_at` + auth triggers |
| `0003_init_rls.sql` | ownership helpers + RLS enable + per-table policies |
| `0004_realtime_storage.sql` | Realtime publication + `cineforge-assets` bucket + policies |
| `0005_hardening.sql` | advisor follow-up: pinned `search_path`, EXECUTE grants |

Regenerate types after any schema change:

```bash
supabase gen types typescript --project-id trazlydqhfvvawcvfhpw \
  > packages/db/supabase/types.ts
```

## Row-Level Security

Every table has RLS enabled. The model is **owner-scoped**: a signed-in user
can only touch rows that belong to their own projects.

- Root: `projects.user_id = auth.uid()`.
- Children traverse via `SECURITY DEFINER` helpers (`owns_project`,
  `owns_scene`, `owns_character`, `owns_series`, `owns_season`) so policies
  don't trigger recursive RLS.
- Policies target the `authenticated` role; `anon` satisfies nothing.
- **Workers bypass RLS** by using the service-role key — they are the only
  writers of generated shots, renders and films.

## Realtime

The creator studio subscribes to **Postgres Changes** on `projects`, `scenes`,
`shots`, `render_jobs` and `films` (added to the `supabase_realtime`
publication, `replica identity full`). RLS applies to Realtime, so a user only
receives changes for rows they own. This replaces the Redis→Socket.IO fan-out
for *client-facing* updates; the worker still uses Redis/BullMQ internally.

Example subscription:

```ts
supabase
  .channel(`project:${projectId}`)
  .on("postgres_changes",
    { event: "UPDATE", schema: "public", table: "projects", filter: `id=eq.${projectId}` },
    (payload) => setProgress(payload.new.progress))
  .subscribe();
```

## Storage

One private bucket, `cineforge-assets` (DB stores keys, never blobs — see
`docs/14-storage.md`). Layout is `projects/{projectId}/…`, and Storage RLS lets
an owner read/write only within their own project's prefix; workers write
generated assets with the service-role key.

## Client setup

```ts
// browser (apps/web) — publishable key, RLS-gated
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@cineforge/db/supabase/types";

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
);
```

```ts
// worker/API (server) — service-role key, bypasses RLS. NEVER ship to browser.
export const admin = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
```

## Advisor notes

`get_advisors(security)` is clean except for intentional, low-risk items:

- **`owns_*` / `is_admin` executable by `authenticated`** — required: RLS
  evaluates them as the signed-in user, and each only reveals the caller's own
  ownership. `anon` and `PUBLIC` execute grants are revoked.
- **`vector` extension in `public`** — pgvector; left in place (resolved via the
  roles' `search_path`). Move to an `extensions` schema if you prefer a clean
  bill of health.
