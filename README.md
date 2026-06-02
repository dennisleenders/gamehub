# GameVault

A shared household game-collection vault — catalog, value, and **per-user** play tracking (Backlog / Playing / Finished + hours), with an immersive box-art home. Built for two+ people sharing one library.

**Stack:** Next.js 15 (App Router) · Supabase (Postgres + Auth + Edge Functions) · TypeScript · deploys to Vercel.

---

## Architecture at a glance

```
src/
  app/
    layout.tsx            Root layout + fonts
    globals.css           Dusk theme tokens + shared classes
    page.tsx              Home (server component → resolves auth → <VaultApp/>)
    login/page.tsx        Email/password auth (client)
    api/
      metadata/route.ts   Fans out to the 3 edge functions, merges metadata
      signout/route.ts    Sign-out handler
  components/
    VaultApp.tsx          The whole authenticated UI (hero, collection, detail, modal)
  lib/
    types.ts              Domain types + constants
    useVault.ts           Data layer: reads/writes Supabase, shapes per-user progress
    supabase/
      client.ts           Browser client
      server.ts           Server client (cookies)
  middleware.ts           Refreshes the auth session + gates /login

supabase/
  migrations/0001_init.sql        Schema + RLS + triggers
  functions/igdb-proxy/           Box art + metadata (Twitch/IGDB token, server-side)
  functions/pricecharting-proxy/  Market values (private token, server-side)
  functions/hltb-proxy/           HowLongToBeat completion times
  seed.sql                        Optional demo data
```

**Why proxies?** IGDB, PriceCharting, and HLTB all need either a secret token or server-side fetching (CORS). Those tokens must never reach the browser, so each lives in a Supabase Edge Function. The Next.js `/api/metadata` route calls them and merges the result for the add/edit form.

**Per-user progress** is the core data idea: a `progress` table keyed by `(game_id, user_id)` so "finished" is personal. Everyone reads everyone's progress (for the "who finished what" badges); you can only write your own (enforced by RLS).

---

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. **Database:** open the SQL Editor and run `supabase/migrations/0001_init.sql`. This creates the tables, row-level security, and the trigger that auto-creates a profile on signup.
3. **Auth:** Authentication → Providers → enable **Email**. For a private 2-person vault, turn **off** "Confirm email" (Authentication → settings) so you can sign in immediately — or leave it on and confirm via the email link.
4. **Keys:** Project Settings → API. Copy the **Project URL** and the **publishable** (or legacy anon) key.

### Edge Functions (metadata proxies)

Install the CLI (`npm i -g supabase`), then from the project root:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Set the secrets (these stay server-side, never in the browser):
supabase secrets set IGDB_CLIENT_ID=xxx IGDB_CLIENT_SECRET=xxx
supabase secrets set PRICECHARTING_TOKEN=xxx   # optional, only if you subscribe

# Deploy the three functions:
supabase functions deploy igdb-proxy
supabase functions deploy pricecharting-proxy
supabase functions deploy hltb-proxy
```

- **IGDB credentials:** register an app on the [Twitch developer console](https://dev.twitch.tv/console) → Client ID + Secret. (IGDB is free for non-commercial use.)
- **PriceCharting:** optional; only needed if you want live market values. Requires a paid subscription for the API token. Without it, you just type values manually.
- **HLTB:** no key needed.

---

## 2. Local development

```bash
cp .env.local.example .env.local      # fill in URL + anon/publishable key
npm install
npm run dev                            # http://localhost:3000
```

Register an account (this becomes a profile), then a second one for your partner. Each device stays signed in — Supabase persists the session and the middleware refreshes it, so you don't log in repeatedly.

---

## 3. Deploy to Vercel

1. Push this folder to a GitHub repo.
2. On [vercel.com](https://vercel.com): **New Project** → import the repo (Vercel auto-detects Next.js).
3. **Environment Variables** — add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. Then in Supabase → Authentication → URL Configuration, add your Vercel domain to **Redirect URLs / Site URL**.

The Edge Functions are deployed to Supabase (step 1), not Vercel — Vercel only hosts the Next.js app.

---

## Notes & next steps

- **Sessions never expire** for practical purposes: the middleware refreshes the token on every request, so a logged-in device stays logged in. To force logout, use the account menu.
- **Settings** (editable platform/genre lists) live in the `app_settings` table and are managed from the in-app gear menu — shared across the household and editable by any member.
- **Barcode scanning** uses `@zxing/browser` (camera) → `/api/upc` → UPCitemdb's free trial endpoint to resolve a UPC/EAN to a product name, which prefills the Add form (tap **FILL** to pull full metadata from IGDB). No API key required — UPCitemdb's trial allows ~100 lookups/day. Needs HTTPS + a camera (works on the Vercel domain); a manual digit-entry fallback covers devices/browsers without camera access. We use UPCitemdb purely as a barcode→name dictionary because IGDB has no barcode field.
- **Realtime:** `useVault` subscribes to `games`, `progress`, and `app_settings` changes, so when your partner adds a game, updates progress, or edits the lists on their phone, your view updates live.
- **Currency** is stored as integer cents (`value_cents`) and displayed in €. Swap the `money()` helper in `lib/types.ts` to change formatting.
- **Tighten before going fully public:** the `next.config.ts` image `remotePatterns` is permissive (`**`); narrow it to the hosts you actually use.
