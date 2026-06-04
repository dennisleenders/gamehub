-- ============================================================================
-- Profile avatars — each member can pick an avatar image instead of the plain
-- initial-letter badge. We store an avatar id (e.g. 'a1'); the client resolves
-- it to an image (see src/lib/avatars.ts). Null means "use the letter fallback",
-- so existing profiles keep working until their owner picks one.
-- ============================================================================
alter table public.profiles add column if not exists avatar text;

-- Let registration seed the avatar alongside name + colour (passed via the
-- signUp metadata). Replacing the function is enough — the on_auth_user_created
-- trigger from 0001_init.sql already points at it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
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
