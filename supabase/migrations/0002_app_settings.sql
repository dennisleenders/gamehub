-- ============================================================================
-- GameVault settings — shared, editable lists (platforms, genres).
--
-- A small key/value store so the household can curate the platform and genre
-- dropdowns from the in-app Settings panel instead of relying on the hardcoded
-- defaults. Same "shared household" model as games: any authenticated member
-- can read and write.
-- ============================================================================

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.app_settings enable row level security;

-- Shared: any authenticated member can read and edit the lists.
create policy "app_settings readable by authenticated"
  on public.app_settings for select to authenticated using (true);
create policy "app_settings insertable by authenticated"
  on public.app_settings for insert to authenticated with check (true);
create policy "app_settings updatable by authenticated"
  on public.app_settings for update to authenticated using (true);

-- Keep updated_at fresh.
create or replace function public.touch_app_settings()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_app_settings();

-- Seed with the current defaults (no-op if rows already exist).
insert into public.app_settings (key, value) values
  ('platforms', '["PS1","PS2","PS3","PS4","PS5","DS","3DS"]'::jsonb),
  ('genres',    '["RPG","Action","Platformer","Horror","Strategy","Adventure"]'::jsonb)
on conflict (key) do nothing;
