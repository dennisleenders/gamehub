-- ============================================================================
-- Feature flag: PriceCharting auto-pricing.
--
-- The PriceCharting API is a paid subscription. We only want to call it during
-- the spells we're actually subscribed (e.g. a bulk add session), so it lives
-- behind a toggle in the in-app Settings panel. Same shared key/value store as
-- platforms; default OFF so a lapsed/absent subscription never gets billed.
--
-- When the flag is off, FILL behaves exactly as before (IGDB + HLTB only) and
-- pricing stays manual.
-- ============================================================================

insert into public.app_settings (key, value) values
  ('pricecharting_enabled', 'false'::jsonb)
on conflict (key) do nothing;
