-- ============================================================================
-- Cache each game's available systems on the row. IGDB lists every platform a
-- game released on; we map those to our curated PLATFORMS and store the result
-- so the add/edit form can narrow its PLATFORM dropdown without re-calling IGDB
-- on every open. Stored as jsonb (same as `screenshots`) — a plain string array.
-- Empty means "unknown" (game predates this column, or has no igdb_id), in which
-- case the form falls back to the full platform list and backfills lazily the
-- next time that game is edited and saved.
-- ============================================================================
alter table public.games
  add column if not exists platforms jsonb not null default '[]'::jsonb;
