-- ============================================================================
-- New signups no longer auto-join a vault.
--
-- Previously handle_new_user() created a profile and that was enough to use the
-- app (everyone shared one vault). Now a profile is NOT vault membership: a fresh
-- user has a profile but current_household() is NULL, and the app routes them to
-- /onboarding to create or join a household.
--
-- The function body is unchanged from 0007 (profile-only) — it is restated here
-- to make explicit that, by design, it does NOT create or join a household. The
-- on_auth_user_created trigger from 0001 already points at this function.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, color, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'color', '#6fc7b3'),
    new.raw_user_meta_data->>'avatar'
  );
  return new;
end;
$$;
