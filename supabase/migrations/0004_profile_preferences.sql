-- ============================================================================
-- GameVault profile preferences — per-user, personal UI settings.
--
-- Unlike app_settings (household-shared), preferences are private to each user:
-- e.g. which overview sections they want visible. Stored as a free-form JSONB
-- blob so we can add more personal settings later without further migrations.
-- The existing "update own profile" RLS policy already restricts writes to the
-- owner, so no new policy is needed.
-- ============================================================================

alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;
