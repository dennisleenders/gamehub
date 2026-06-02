-- ============================================================================
-- GameVault schema — a shared household vault with per-user play tracking.
--
-- Model:
--   profiles  : one row per auth user (display name + colour). Mirrors auth.users.
--   games     : the shared collection. Any signed-in member can read/write.
--   progress  : per-user play state for a game (status + hours). The piece that
--               makes "finished" personal rather than global.
--
-- "Shared household" means every authenticated member sees the same games and
-- can edit them; only personal progress rows are restricted to their owner.
-- ============================================================================

-- ---- PROFILES --------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#6fc7b3',
  created_at  timestamptz not null default now()
);

-- Auto-create a profile when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'color', '#6fc7b3')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- GAMES (shared) --------------------------------------------------------
create table if not exists public.games (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  platform        text not null,
  status          text not null default 'owned' check (status in ('owned','wishlist')),
  condition       text,
  region          text,
  genre           text,
  year            int,
  developer       text,
  publisher       text,
  rating          int,
  value_cents     int default 0,          -- market value in cents (currency-agnostic)
  cover           text,
  description     text,
  screenshots     jsonb default '[]'::jsonb,
  hltb            jsonb,                   -- { main, extra, complete } in hours
  priority        text,                    -- wishlist only: high|med|low
  notes           text,
  igdb_id         bigint,
  pricecharting_id text,
  last_synced     timestamptz,
  added_by        uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists games_status_idx on public.games(status);
create index if not exists games_platform_idx on public.games(platform);

-- ---- PROGRESS (per user) ---------------------------------------------------
create table if not exists public.progress (
  game_id   uuid not null references public.games(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  status    text not null default 'backlog' check (status in ('backlog','playing','finished')),
  hours     numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create index if not exists progress_user_idx on public.progress(user_id);
create index if not exists progress_status_idx on public.progress(status);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.games    enable row level security;
alter table public.progress enable row level security;

-- Profiles: everyone in the household can see each other (needed for "who
-- finished what" attribution); you may only edit your own.
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);
create policy "update own profile"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- Games: shared. Any authenticated member can read and write the whole
-- collection (it's a household, not per-user libraries).
create policy "games readable by authenticated"
  on public.games for select to authenticated using (true);
create policy "games insertable by authenticated"
  on public.games for insert to authenticated with check (true);
create policy "games updatable by authenticated"
  on public.games for update to authenticated using (true);
create policy "games deletable by authenticated"
  on public.games for delete to authenticated using (true);

-- Progress: everyone can READ all progress (so you see your partner's status),
-- but you can only WRITE your own rows.
create policy "progress readable by authenticated"
  on public.progress for select to authenticated using (true);
create policy "insert own progress"
  on public.progress for insert to authenticated with check (auth.uid() = user_id);
create policy "update own progress"
  on public.progress for update to authenticated using (auth.uid() = user_id);
create policy "delete own progress"
  on public.progress for delete to authenticated using (auth.uid() = user_id);

-- Keep progress.updated_at fresh.
create or replace function public.touch_progress()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists progress_touch on public.progress;
create trigger progress_touch before update on public.progress
  for each row execute function public.touch_progress();
