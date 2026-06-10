-- ============================================================================
-- Households (vaults) — the multi-tenant foundation.
--
-- Until now GameVault was single-tenant: every authenticated user shared ONE
-- global collection. A "household" is now a self-contained vault. Each user
-- belongs to exactly ONE household; members of a household share its games,
-- settings and challenges, isolated from every other household.
--
--   households        : the vault (name + a shareable invite code).
--   household_members : which user belongs to which vault, and their role.
--
-- One-vault-per-user is enforced structurally by making household_members.user_id
-- the PRIMARY KEY (a user can appear at most once). Joining/creating happens via
-- SECURITY DEFINER RPCs (see 0014); membership-scoped RLS lands in 0013.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references public.profiles(id)   on delete cascade,
  role         text not null default 'member' check (role in ('owner','member')),
  joined_at    timestamptz not null default now(),
  -- PK on user_id alone: a user can belong to at most one household. This is the
  -- load-bearing "one vault per user" guard — it also wins any concurrent-join
  -- race via a unique_violation that the RPCs translate to a friendly error.
  primary key (user_id)
);

create index if not exists household_members_hid_idx on public.household_members(household_id);

alter table public.households        enable row level security;
alter table public.household_members enable row level security;

-- Generate a short, URL-safe, human-friendly invite code. The alphabet drops
-- ambiguous characters (no 0/O/1/I/L). Uses the built-in random() (not pgcrypto's
-- gen_random_bytes, which lives in the `extensions` schema and isn't on a
-- SECURITY DEFINER function's search_path) — fine here, since these aren't
-- secrets: uniqueness is guaranteed by the UNIQUE constraint plus a retry loop in
-- the RPCs (~31^8 ≈ 8.5e11 combinations, so a collision is effectively never hit).
create or replace function public.gen_invite_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
           1 + floor(random() * 31)::int, 1),
    '')
  from generate_series(1, 8);
$$;
