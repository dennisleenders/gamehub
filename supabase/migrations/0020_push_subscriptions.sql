-- ============================================================================
-- GameVault Web Push subscriptions — one row per (device × user). The browser's
-- PushManager mints an opaque endpoint URL + a pair of encryption keys (p256dh,
-- auth); together they're everything the sender needs to deliver an encrypted
-- payload to that exact device.
--
-- WRITE MODEL (mirrors achievement_unlocks 0019): the client writes its OWN rows
-- directly under RLS — exactly like every other table useVault touches — so there
-- is no API route for subscribe/unsubscribe. Members never need to READ each
-- other's subscriptions: the push-send Edge Function fans out using the service
-- role (which bypasses RLS), so a strict own-rows policy is correct here.
--
-- The endpoint is globally unique, so re-subscribing the same device upserts on
-- it (the client uses onConflict: "endpoint"); that's why an UPDATE policy exists
-- alongside INSERT. Rows cascade away with the household or the profile.
-- ============================================================================
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id)  on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now()
);

create index if not exists push_subs_household_idx
  on public.push_subscriptions(household_id);

alter table public.push_subscriptions enable row level security;

-- Own-rows only: a user reads/writes/deletes only their own device subscriptions
-- within their household. The sender reads everyone's via the service role.
create policy "read own subscriptions"
  on public.push_subscriptions for select to authenticated
  using (household_id = public.current_household() and auth.uid() = profile_id);
create policy "insert own subscriptions"
  on public.push_subscriptions for insert to authenticated
  with check (household_id = public.current_household() and auth.uid() = profile_id);
-- Required so the client's upsert (onConflict: endpoint) can refresh an existing row.
create policy "update own subscriptions"
  on public.push_subscriptions for update to authenticated
  using (household_id = public.current_household() and auth.uid() = profile_id)
  with check (household_id = public.current_household() and auth.uid() = profile_id);
create policy "delete own subscriptions"
  on public.push_subscriptions for delete to authenticated
  using (household_id = public.current_household() and auth.uid() = profile_id);

-- Deliberately NOT added to supabase_realtime: nothing subscribes to changes here.
