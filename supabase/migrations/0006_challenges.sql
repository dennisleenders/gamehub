-- ============================================================================
-- GameVault challenges — shared, multi-user "races" the household competes in.
--
-- A challenge defines a goal (currently only: complete N games within a date
-- window) that EVERY household member races toward at once. Per-user progress
-- is computed CLIENT-side from games/progress/playthroughs (the same completion
-- model used everywhere else) — only the challenge DEFINITION is stored here.
--
-- `type` is intentionally a text + check so new challenge kinds can be added
-- later without a schema change to the progress logic.
--
-- Sharing model differs slightly from games: everyone reads + races, but only
-- the CREATOR can edit/delete their own challenge.
-- ============================================================================
create table if not exists public.challenges (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  type         text not null default 'complete_games' check (type in ('complete_games')),
  target       int  not null check (target > 0),
  period_start date not null,
  period_end   date not null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (period_end >= period_start)
);

create index if not exists challenges_period_idx on public.challenges(period_start, period_end);

alter table public.challenges enable row level security;

-- All authenticated members read + race; only the creator writes.
create policy "challenges readable by authenticated"
  on public.challenges for select to authenticated using (true);
create policy "insert own challenges"
  on public.challenges for insert to authenticated with check (auth.uid() = created_by);
create policy "update own challenges"
  on public.challenges for update to authenticated using (auth.uid() = created_by);
create policy "delete own challenges"
  on public.challenges for delete to authenticated using (auth.uid() = created_by);

-- Keep updated_at fresh (same pattern as touch_progress in 0001_init.sql).
create or replace function public.touch_challenges()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists challenges_touch on public.challenges;
create trigger challenges_touch before update on public.challenges
  for each row execute function public.touch_challenges();
