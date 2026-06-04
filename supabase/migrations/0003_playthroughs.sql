-- ============================================================================
-- Playthrough history — replaying a game.
--
-- The `progress` row remains the CURRENT/active run for a (game, user): its
-- status (backlog/playing/finished) + hours drive the hero, stats and filters.
--
-- `playthroughs` archives COMPLETED runs. When a finished game is set back to
-- playing (a replay), the just-finished run is copied here and the progress row
-- starts a fresh session at 0 hours. So:
--
--   total completions = count(playthroughs) + (progress.status = 'finished' ? 1 : 0)
--
-- Same sharing model as progress: everyone reads; you only write your own rows.
-- ============================================================================
create table if not exists public.playthroughs (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  hours       numeric not null default 0,
  finished_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists playthroughs_game_user_idx on public.playthroughs(game_id, user_id);

alter table public.playthroughs enable row level security;

create policy "playthroughs readable by authenticated"
  on public.playthroughs for select to authenticated using (true);
create policy "insert own playthroughs"
  on public.playthroughs for insert to authenticated with check (auth.uid() = user_id);
create policy "update own playthroughs"
  on public.playthroughs for update to authenticated using (auth.uid() = user_id);
create policy "delete own playthroughs"
  on public.playthroughs for delete to authenticated using (auth.uid() = user_id);
