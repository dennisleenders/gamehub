-- ============================================================================
-- Realtime under multi-tenancy.
--
-- useVault subscribes to postgres_changes on these tables and adds a
-- `household_id=eq.<id>` filter per channel (see useVault.ts). Two things make
-- that correct:
--
--   1. The tables must be in the supabase_realtime publication (so changes are
--      streamed at all). Each ADD is guarded because re-adding errors.
--
--   2. REPLICA IDENTITY FULL — by default a DELETE event carries only the row's
--      primary key, so a client-side household_id filter would never match a
--      delete (the payload has no household_id) and members would miss deletions
--      / could in principle see another vault's delete on the shared channel.
--      FULL makes the old row (incl. household_id) available to the filter.
--
-- SECURITY NOTE: the real tenant-isolation boundary is RLS (0013). Postgres
-- Changes only enforces RLS when realtime authorization is enabled on the
-- project — VERIFY this is on for the deployed Supabase instance. The per-channel
-- filter is an efficiency/UX guard, not the security mechanism.
-- ============================================================================

do $$ begin alter publication supabase_realtime add table public.games;            exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.progress;         exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.playthroughs;     exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.challenges;       exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.app_settings;     exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.profiles;         exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.household_members; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.households;       exception when others then null; end $$;

alter table public.games             replica identity full;
alter table public.progress          replica identity full;
alter table public.playthroughs      replica identity full;
alter table public.challenges        replica identity full;
alter table public.app_settings      replica identity full;
alter table public.profiles          replica identity full;
alter table public.household_members replica identity full;
alter table public.households        replica identity full;
