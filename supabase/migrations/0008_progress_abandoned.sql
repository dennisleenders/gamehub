-- ============================================================================
-- Add an "abandoned" play status — a run the player gave up on (distinct from
-- backlog/playing/finished). It is NOT a completion: stats and challenges still
-- only count 'finished', so abandoned games never award points or completions.
-- Hours logged on them still count toward total play time.
-- ============================================================================
alter table public.progress drop constraint if exists progress_status_check;
alter table public.progress
  add constraint progress_status_check
  check (status in ('backlog','playing','finished','abandoned'));
