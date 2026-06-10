-- ============================================================================
-- Per-household app_settings.
--
-- app_settings was a single global key/value store (PK = key). Each household
-- now needs its OWN platforms/genres lists and — crucially — its own
-- PriceCharting token, so the primary key becomes composite (household_id, key).
--
-- The existing global rows (including any pricecharting_token) are backfilled
-- onto the default household from 0011, so the migrated vault keeps its current
-- settings. New vaults get seeded by create_household() (see 0014).
--
-- Ordering matters: add the column and backfill it BEFORE setting NOT NULL and
-- swapping the primary key, or the statements fail on the existing rows.
-- ============================================================================

alter table public.app_settings
  add column if not exists household_id uuid references public.households(id) on delete cascade;

do $$
declare
  default_hid uuid;
begin
  select id into default_hid
  from public.households
  where name = 'My Vault'
  order by created_at asc
  limit 1;

  if default_hid is not null then
    update public.app_settings set household_id = default_hid where household_id is null;
  end if;
end $$;

alter table public.app_settings drop constraint if exists app_settings_pkey;
alter table public.app_settings alter column household_id set not null;
alter table public.app_settings add primary key (household_id, key);
