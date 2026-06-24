-- ============================================================================
-- GameVault achievement unlocks — a durable, append-only record of WHEN each
-- achievement tier was reached.
--
-- Achievements themselves stay computed live (see lib/achievements.ts) from the
-- same games/progress/playthroughs everything else derives from — points, tiers
-- and progress are real-time for free. The ONE thing live data can't reconstruct
-- accurately is the moment a tier was crossed (a later edit/delete shifts the
-- derived timestamps), so that moment is stored here and nowhere else.
--
-- Written by the client when useAchievementToasts detects a genuine in-session
-- unlock (deriveUnlockEvents). The unique constraint makes those writes
-- idempotent; rows are never auto-deleted, so the history/timeline stays truthful
-- even if live progress later regresses. We deliberately do NOT backfill tiers
-- earned before this feature shipped — a row's absence reads as "—", not a
-- misleading now() timestamp.
--
-- Sharing model mirrors challenges: everyone in the household reads (member
-- comparison + coverage), but a user only writes their own unlock rows.
-- ============================================================================
create table if not exists public.achievement_unlocks (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  profile_id     uuid not null references public.profiles(id)  on delete cascade,
  achievement_id text not null,
  tier           text not null check (tier in ('bronze','silver','gold','platinum')),
  unlocked_at    timestamptz not null default now(),
  unique (household_id, profile_id, achievement_id, tier)
);

create index if not exists ach_unlocks_household_profile_idx
  on public.achievement_unlocks(household_id, profile_id);

alter table public.achievement_unlocks enable row level security;

-- All household members read (comparison + coverage); a user writes only own rows.
create policy "unlocks readable in household"
  on public.achievement_unlocks for select to authenticated
  using (household_id = public.current_household());
create policy "insert own unlocks"
  on public.achievement_unlocks for insert to authenticated
  with check (household_id = public.current_household() and auth.uid() = profile_id);
create policy "delete own unlocks"
  on public.achievement_unlocks for delete to authenticated
  using (household_id = public.current_household() and auth.uid() = profile_id);

-- Realtime (mirror 0016): publish + REPLICA IDENTITY FULL so a client-side
-- household_id filter still matches DELETE payloads.
do $$ begin alter publication supabase_realtime add table public.achievement_unlocks; exception when others then null; end $$;
alter table public.achievement_unlocks replica identity full;
