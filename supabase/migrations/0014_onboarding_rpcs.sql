-- ============================================================================
-- Onboarding RPCs — the only way to create or join a household.
--
-- WHY RPCs INSTEAD OF RAW INSERTS:
--   * Atomicity — creating a vault must insert the household AND the owner's
--     membership as one unit; a client doing two separate inserts could orphan a
--     household if the second call fails.
--   * Chicken-and-egg RLS — you cannot write a safe households/members INSERT
--     policy: to insert a household you'd need to already be a member, but you
--     can't be a member of a household that doesn't exist yet. A SECURITY DEFINER
--     function bypasses RLS for this bootstrap while still enforcing the rules in
--     code (authenticated, not already in a vault, valid invite code).
--
-- The "already in a household" guard is enforced three ways: the user_id PK on
-- household_members (hard, wins races), the explicit checks below (friendly
-- error), and `on conflict do nothing` in the 0011 backfill.
-- ============================================================================

-- Create a new vault and make the caller its owner. Returns the new household.
create or replace function public.create_household(p_name text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  code  text;
  hh    public.households;
  tries int := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from public.household_members where user_id = uid) then
    raise exception 'already in a household' using errcode = '23505';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required';
  end if;

  -- Retry on the (vanishingly rare) invite-code collision.
  loop
    tries := tries + 1;
    code := public.gen_invite_code();
    begin
      insert into public.households (name, invite_code, created_by)
      values (trim(p_name), code, uid)
      returning * into hh;
      exit;
    exception when unique_violation then
      if tries >= 5 then raise; end if;
    end;
  end loop;

  insert into public.household_members (household_id, user_id, role)
  values (hh.id, uid, 'owner');

  -- Seed this household's settings (mirrors the global seed the app shipped with).
  insert into public.app_settings (household_id, key, value) values
    (hh.id, 'platforms', '["PS1","PS2","PS3","PS4","PS5","DS","3DS"]'::jsonb),
    (hh.id, 'genres',    '["RPG","Action","Platformer","Horror","Strategy","Adventure"]'::jsonb),
    (hh.id, 'pricecharting_enabled', 'false'::jsonb)
  on conflict (household_id, key) do nothing;

  return hh;
end;
$$;

-- Join an existing vault by invite code. Returns the joined household.
create or replace function public.join_household(p_code text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hh  public.households;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if exists (select 1 from public.household_members where user_id = uid) then
    raise exception 'already in a household' using errcode = '23505';
  end if;

  select * into hh from public.households
  where invite_code = upper(trim(p_code));
  if hh.id is null then
    raise exception 'invalid invite code';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (hh.id, uid, 'member');

  return hh;
end;
$$;

-- Owner-only: roll the invite code (invalidates the old link). Returns the new code.
create or replace function public.regenerate_invite_code(p_household_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code  text;
  tries int := 0;
begin
  if not public.is_owner(p_household_id) then
    raise exception 'not owner';
  end if;

  loop
    tries := tries + 1;
    code := public.gen_invite_code();
    begin
      update public.households set invite_code = code where id = p_household_id;
      exit;
    exception when unique_violation then
      if tries >= 5 then raise; end if;
    end;
  end loop;

  return code;
end;
$$;

-- Leave the caller's household. Prevents an orphaned ownerless vault:
--   * last member out → delete the vault (cascades all its data).
--   * an owner leaving with others remaining → promote the earliest joiner.
create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  hid       uuid;
  my_role   text;
  remaining int;
  heir      uuid;
begin
  select household_id, role into hid, my_role
  from public.household_members where user_id = uid;
  if hid is null then
    return;
  end if;

  delete from public.household_members where user_id = uid;

  select count(*) into remaining
  from public.household_members where household_id = hid;

  if remaining = 0 then
    delete from public.households where id = hid;  -- cascade removes all vault data
  elsif my_role = 'owner' then
    select user_id into heir
    from public.household_members
    where household_id = hid
    order by joined_at asc
    limit 1;
    update public.household_members set role = 'owner' where user_id = heir;
  end if;
end;
$$;

revoke all on function public.create_household(text)       from public;
revoke all on function public.join_household(text)         from public;
revoke all on function public.regenerate_invite_code(uuid) from public;
revoke all on function public.leave_household()            from public;
grant execute on function public.create_household(text)       to authenticated;
grant execute on function public.join_household(text)         to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
grant execute on function public.leave_household()            to authenticated;
