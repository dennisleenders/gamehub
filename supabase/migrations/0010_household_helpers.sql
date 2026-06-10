-- ============================================================================
-- Household RLS helpers — SECURITY DEFINER functions that every other table's
-- policies lean on instead of querying household_members directly.
--
-- WHY SECURITY DEFINER (the recursion problem):
--   The RLS policy on household_members must answer "is the caller a member of
--   this household?", which means reading household_members. If that read were
--   itself subject to the same policy, Postgres would re-enter the policy to
--   evaluate it → "infinite recursion detected in policy for relation
--   household_members". A SECURITY DEFINER function runs as its owner, so its
--   internal read bypasses the caller's RLS and breaks the loop. Every other
--   table references these helpers rather than reading household_members, so
--   none of them recurse either.
--
--   `stable`               → planner evaluates once per statement.
--   `set search_path = public` → prevents schema-shadowing attacks on a definer fn.
-- ============================================================================

-- The household the current user belongs to (NULL if they aren't in one yet —
-- e.g. a brand-new signup before onboarding).
create or replace function public.current_household()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.household_members where user_id = auth.uid();
$$;

-- Is the current user a member of household `hid`?
create or replace function public.is_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where user_id = auth.uid() and household_id = hid
  );
$$;

-- Is the current user the OWNER of household `hid`?
create or replace function public.is_owner(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members
    where user_id = auth.uid() and household_id = hid and role = 'owner'
  );
$$;

revoke all on function public.current_household()  from public;
revoke all on function public.is_member(uuid)      from public;
revoke all on function public.is_owner(uuid)       from public;
grant execute on function public.current_household() to authenticated;
grant execute on function public.is_member(uuid)     to authenticated;
grant execute on function public.is_owner(uuid)      to authenticated;
