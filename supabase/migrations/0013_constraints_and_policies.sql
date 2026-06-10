-- ============================================================================
-- Lock household_id NOT NULL and rewrite every RLS policy from
-- "to authenticated using (true)" → membership-scoped.
--
-- Before this migration any signed-in user could read/write everything (one
-- shared vault). After it, access to each row is gated on the caller belonging
-- to that row's household — true tenant isolation. Per-user write restrictions
-- on progress/playthroughs/challenges are preserved AND combined with the
-- household check.
--
-- Must run after 0011/0012 have backfilled household_id everywhere.
-- ============================================================================

alter table public.games        alter column household_id set not null;
alter table public.progress     alter column household_id set not null;
alter table public.playthroughs alter column household_id set not null;
alter table public.challenges   alter column household_id set not null;

-- ---- HOUSEHOLDS ------------------------------------------------------------
-- Members can see their own household; only the owner can rename or delete it.
-- There is intentionally NO insert policy — households are created only through
-- the create_household() RPC (see 0014), which bootstraps membership atomically.
create policy households_select on public.households for select to authenticated
  using (public.is_member(id));
create policy households_update_owner on public.households for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));
create policy households_delete_owner on public.households for delete to authenticated
  using (public.is_owner(id));

-- ---- HOUSEHOLD_MEMBERS -----------------------------------------------------
-- You can see everyone in your own household. You can remove yourself, and an
-- owner can remove anyone / change roles. Joining is via the join_household()
-- RPC, so there is no insert policy.
create policy members_select on public.household_members for select to authenticated
  using (household_id = public.current_household());
create policy members_delete on public.household_members for delete to authenticated
  using (user_id = auth.uid() or public.is_owner(household_id));
create policy members_update_owner on public.household_members for update to authenticated
  using (public.is_owner(household_id)) with check (public.is_owner(household_id));

-- ---- GAMES (shared within the household) -----------------------------------
drop policy if exists "games readable by authenticated"  on public.games;
drop policy if exists "games insertable by authenticated" on public.games;
drop policy if exists "games updatable by authenticated"  on public.games;
drop policy if exists "games deletable by authenticated"  on public.games;

create policy games_select on public.games for select to authenticated
  using (household_id = public.current_household());
create policy games_insert on public.games for insert to authenticated
  with check (household_id = public.current_household());
create policy games_update on public.games for update to authenticated
  using (household_id = public.current_household())
  with check (household_id = public.current_household());
create policy games_delete on public.games for delete to authenticated
  using (household_id = public.current_household());

-- ---- PROGRESS (read within household; write your OWN rows) -----------------
drop policy if exists "progress readable by authenticated" on public.progress;
drop policy if exists "insert own progress" on public.progress;
drop policy if exists "update own progress" on public.progress;
drop policy if exists "delete own progress" on public.progress;

create policy progress_select on public.progress for select to authenticated
  using (household_id = public.current_household());
create policy progress_insert on public.progress for insert to authenticated
  with check (household_id = public.current_household() and auth.uid() = user_id);
create policy progress_update on public.progress for update to authenticated
  using (household_id = public.current_household() and auth.uid() = user_id)
  with check (household_id = public.current_household() and auth.uid() = user_id);
create policy progress_delete on public.progress for delete to authenticated
  using (household_id = public.current_household() and auth.uid() = user_id);

-- ---- PLAYTHROUGHS (read within household; write your OWN rows) -------------
drop policy if exists "playthroughs readable by authenticated" on public.playthroughs;
drop policy if exists "insert own playthroughs" on public.playthroughs;
drop policy if exists "update own playthroughs" on public.playthroughs;
drop policy if exists "delete own playthroughs" on public.playthroughs;

create policy playthroughs_select on public.playthroughs for select to authenticated
  using (household_id = public.current_household());
create policy playthroughs_insert on public.playthroughs for insert to authenticated
  with check (household_id = public.current_household() and auth.uid() = user_id);
create policy playthroughs_update on public.playthroughs for update to authenticated
  using (household_id = public.current_household() and auth.uid() = user_id)
  with check (household_id = public.current_household() and auth.uid() = user_id);
create policy playthroughs_delete on public.playthroughs for delete to authenticated
  using (household_id = public.current_household() and auth.uid() = user_id);

-- ---- CHALLENGES (read within household; only the creator writes) -----------
drop policy if exists "challenges readable by authenticated" on public.challenges;
drop policy if exists "insert own challenges" on public.challenges;
drop policy if exists "update own challenges" on public.challenges;
drop policy if exists "delete own challenges" on public.challenges;

create policy challenges_select on public.challenges for select to authenticated
  using (household_id = public.current_household());
create policy challenges_insert on public.challenges for insert to authenticated
  with check (household_id = public.current_household() and auth.uid() = created_by);
create policy challenges_update on public.challenges for update to authenticated
  using (household_id = public.current_household() and auth.uid() = created_by)
  with check (household_id = public.current_household() and auth.uid() = created_by);
create policy challenges_delete on public.challenges for delete to authenticated
  using (household_id = public.current_household() and auth.uid() = created_by);

-- ---- APP_SETTINGS (shared within the household) ----------------------------
-- Note the DELETE policy: useVault.saveSettings deletes the token row when it is
-- cleared. The original 0002 migration never defined a delete policy, so that
-- delete silently no-op'd. It is added here for the first time.
drop policy if exists "app_settings readable by authenticated"  on public.app_settings;
drop policy if exists "app_settings insertable by authenticated" on public.app_settings;
drop policy if exists "app_settings updatable by authenticated"  on public.app_settings;

create policy app_settings_select on public.app_settings for select to authenticated
  using (household_id = public.current_household());
create policy app_settings_insert on public.app_settings for insert to authenticated
  with check (household_id = public.current_household());
create policy app_settings_update on public.app_settings for update to authenticated
  using (household_id = public.current_household())
  with check (household_id = public.current_household());
create policy app_settings_delete on public.app_settings for delete to authenticated
  using (household_id = public.current_household());

-- ---- PROFILES (visible to your household; plus always your own) ------------
-- profiles has no household_id, so visibility is resolved through membership.
-- The `id = auth.uid()` branch lets a brand-new, vault-less user still read
-- their own profile (page.tsx selects it immediately after signup, before the
-- user has created or joined a household). "update own profile" stays as-is.
drop policy if exists "profiles readable by authenticated" on public.profiles;

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.household_members m
      where m.user_id = public.profiles.id
        and m.household_id = public.current_household()
    )
  );
