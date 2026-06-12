-- ============================================================================
-- Add a neutral "collection" play status and make it the new default.
--
-- Previously every owned game got a 'backlog' progress row by default, so
-- "backlog" never meant a deliberate choice — it just meant "this is in the
-- vault". "collection" now carries that neutral meaning (in your GameVault, no
-- intent to play), leaving "backlog" as the opt-in "I want to play this someday"
-- list. Like backlog, it is NOT a completion: stats and challenges still only
-- count 'finished', so this neutral status interacts with nothing.
-- ============================================================================
alter table public.progress drop constraint if exists progress_status_check;
alter table public.progress
  add constraint progress_status_check
  check (status in ('collection','backlog','playing','finished','abandoned'));

-- New rows default to the neutral state instead of backlog.
alter table public.progress alter column status set default 'collection';

-- One-time reset: existing 'backlog' rows were auto-assigned, never an explicit
-- "want to play" choice, so reclassify them as neutral. Members can opt games
-- back into their backlog deliberately afterwards.
update public.progress set status = 'collection' where status = 'backlog';
