-- ============================================================================
-- Scope the data tables to a household + migrate the existing single vault.
--
-- Adds a (nullable, for now) household_id to every shared/owned table, then
-- BACKFILLS all current data into one default household so existing users lose
-- nothing — their whole collection simply becomes "their vault". 0013 flips the
-- columns to NOT NULL once the backfill has populated them.
--
-- Idempotent: safe to run more than once (guards on the default-household name
-- and only touches rows whose household_id is still null).
-- ============================================================================

alter table public.games        add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.progress     add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.playthroughs add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.challenges   add column if not exists household_id uuid references public.households(id) on delete cascade;

do $$
declare
  default_hid uuid;
  owner_id    uuid;
begin
  -- Nothing to migrate on a fresh database (no users yet).
  if not exists (select 1 from public.profiles) then
    return;
  end if;

  -- Reuse the default household if a previous run already created it.
  select id into default_hid
  from public.households
  where name = 'My Vault'
  order by created_at asc
  limit 1;

  if default_hid is null then
    -- Owner = the earliest profile (closest thing we have to "the founder").
    select id into owner_id from public.profiles order by created_at asc limit 1;

    insert into public.households (name, invite_code, created_by)
    values ('My Vault', public.gen_invite_code(), owner_id)
    returning id into default_hid;

    -- Everyone who already had access becomes a member; the founder is owner.
    insert into public.household_members (household_id, user_id, role)
    select default_hid, p.id,
           case when p.id = owner_id then 'owner' else 'member' end
    from public.profiles p
    on conflict (user_id) do nothing;
  end if;

  -- Fold all existing data into the default household.
  update public.games        set household_id = default_hid where household_id is null;
  update public.progress     set household_id = default_hid where household_id is null;
  update public.playthroughs set household_id = default_hid where household_id is null;
  update public.challenges   set household_id = default_hid where household_id is null;
end $$;
