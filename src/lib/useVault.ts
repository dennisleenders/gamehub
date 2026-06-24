"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_GENRES } from "@/lib/types";
import type { Game, Profile, PlayStatus, Challenge, MemberWithProfile, AchievementUnlock } from "@/lib/types";
import type { UnlockEvent } from "@/lib/achievements";

// Central data layer. Replaces the PoC's in-memory state + window.storage with
// live Supabase queries, while preserving the same shape the UI expects
// (games carry a per-user `progress` map keyed by user id).
//
// Everything is scoped to one household. RLS auto-scopes reads to the caller's
// vault, so the SELECTs don't filter by household_id; but inserts must stamp it
// (RLS `with check`), and realtime channels filter by it for efficiency.
export function useVault(currentUserId: string, householdId: string) {
  const supabase = createClient();
  const [games, setGames] = useState<Game[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  // Members of this household joined to their profiles, for the member-management UI.
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  // Shared, household-wide challenges. Only the definitions live in the DB;
  // each user's progress is derived client-side from completions.
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  // Durable achievement-tier unlock history (timestamps). Achievements are still
  // computed live; only the unlock moment is stored. See 0019_achievement_unlocks.
  const [unlocks, setUnlocks] = useState<AchievementUnlock[]>([]);
  // Genres are a fixed, app-defined list — not user-editable.
  const genres = DEFAULT_GENRES;
  // Shared feature flag: whether FILL also fetches prices from the paid
  // PriceCharting API. Off unless explicitly turned on in Settings.
  const [priceChartingEnabled, setPriceChartingEnabled] = useState(false);
  // Whether a PriceCharting token is saved in app_settings. We deliberately never
  // pull the token value itself to the client — only this boolean — so it stays
  // server-side (the metadata API route reads the value to make the actual call).
  const [priceChartingTokenSet, setPriceChartingTokenSet] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: gs }, { data: prog }, { data: profs }, { data: settings }, { data: runs }, { data: chals }, { data: mems }, { data: unlockRows }, { count: tokenCount }] = await Promise.all([
      supabase.from("games").select("*").order("created_at", { ascending: false }),
      supabase.from("progress").select("*"),
      supabase.from("profiles").select("*"),
      // Exclude the PriceCharting token row: it must never reach the browser.
      supabase.from("app_settings").select("*").neq("key", "pricecharting_token"),
      supabase.from("playthroughs").select("*"),
      supabase.from("challenges").select("*").order("created_at", { ascending: false }),
      supabase.from("household_members").select("household_id, user_id, role, joined_at"),
      supabase.from("achievement_unlocks").select("*").order("unlocked_at", { ascending: false }),
      // Head/count query: tells us a token exists without fetching its value.
      supabase.from("app_settings").select("key", { count: "exact", head: true }).eq("key", "pricecharting_token"),
    ]);
    const byGame: Record<string, Game["progress"]> = {};
    (prog ?? []).forEach((p: any) => {
      (byGame[p.game_id] ||= {})![p.user_id] = { status: p.status, hours: Number(p.hours), updated_at: p.updated_at };
    });
    // Group archived runs by game then user, oldest→newest (finish order).
    const runsByGame: Record<string, NonNullable<Game["playthroughs"]>> = {};
    (runs ?? []).forEach((r: any) => {
      const byUser = (runsByGame[r.game_id] ||= {});
      (byUser[r.user_id] ||= []).push({ ...r, hours: Number(r.hours) });
    });
    Object.values(runsByGame).forEach((byUser) =>
      Object.values(byUser).forEach((list) => list.sort((a, b) => (a.finished_at < b.finished_at ? -1 : 1))));
    setGames((gs ?? []).map((g: any) => ({ ...g, progress: byGame[g.id] ?? {}, playthroughs: runsByGame[g.id] ?? {} })));
    setProfiles(profs ?? []);
    setChallenges(chals ?? []);
    setUnlocks(unlockRows ?? []);
    // Join memberships to their profiles for the member-management UI.
    const profById: Record<string, Profile> = {};
    (profs ?? []).forEach((p: any) => { profById[p.id] = p; });
    setMembers((mems ?? []).map((m: any) => ({ ...m, profile: profById[m.user_id] })));
    // Settings are a small key/value store; fall back to the bundled defaults
    // if the table is empty or hasn't been migrated yet.
    const byKey: Record<string, any> = {};
    (settings ?? []).forEach((s: any) => { byKey[s.key] = s.value; });
    setPriceChartingEnabled(byKey.pricecharting_enabled === true);
    setPriceChartingTokenSet((tokenCount ?? 0) > 0);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // Realtime: when a household-scoped table changes (e.g. a member adds a game
  // or updates progress on another device), refresh. Each channel is filtered to
  // this household for efficiency (RLS is the actual isolation boundary — see
  // 0016_realtime.sql). `profiles` has no household_id so it stays unfiltered;
  // its SELECT is still RLS-scoped, so an unrelated change only triggers a
  // harmless reload. `households`/`household_members` keep the vault name and
  // member list live (owner sees a new member appear instantly).
  useEffect(() => {
    const hh = `household_id=eq.${householdId}`;
    const ch = supabase
      .channel(`vault:${householdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: hh }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "progress", filter: hh }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings", filter: hh }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "playthroughs", filter: hh }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "challenges", filter: hh }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "achievement_unlocks", filter: hh }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "household_members", filter: hh }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "households", filter: `id=eq.${householdId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, load, householdId]);

  // Mobile PWAs (especially iOS) freeze the page — and with it the realtime
  // socket — while backgrounded, so changes made by others while you were away
  // never arrive and the stale socket doesn't catch up on return. Refetch when the
  // app returns to the foreground to backfill that gap. (supabase-js reconnects the
  // socket itself; this only covers events missed while frozen.)
  //
  // visibilitychange alone is enough for the PWA background→foreground case — we
  // deliberately don't also listen to `focus` (the two double-fire on return, and
  // each load() is ~9 queries). Throttled so rapid app-switching can't trigger a
  // full reload every time.
  const lastForegroundLoad = useRef(0);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastForegroundLoad.current < 10_000) return;
      lastForegroundLoad.current = now;
      load();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [load]);

  const saveGame = useCallback(async (g: Partial<Game> & { myStatus?: PlayStatus; myHours?: number }) => {
    const { id, progress, myStatus, myHours, ...fields } = g as any;
    let gameId = id;
    if (id) {
      await supabase.from("games").update(fields).eq("id", id);
    } else {
      const { data } = await supabase
        .from("games")
        .insert({ ...fields, added_by: currentUserId, household_id: householdId })
        .select("id")
        .single();
      gameId = data?.id;
    }
    // Upsert the current user's own progress row.
    if (gameId && fields.status === "owned" && myStatus !== undefined) {
      // Replay: if the current run is finished and we're switching back to
      // playing, archive that completed run before the new session overwrites it.
      if (myStatus === "playing") {
        const { data: existing } = await supabase
          .from("progress")
          .select("status, hours, updated_at")
          .eq("game_id", gameId)
          .eq("user_id", currentUserId)
          .maybeSingle();
        if (existing?.status === "finished") {
          await supabase.from("playthroughs").insert({
            game_id: gameId,
            user_id: currentUserId,
            household_id: householdId,
            hours: existing.hours,
            finished_at: existing.updated_at ?? new Date().toISOString(),
          });
        }
      }
      await supabase.from("progress").upsert({
        game_id: gameId, user_id: currentUserId, household_id: householdId,
        status: myStatus, hours: myHours ?? 0,
      });
    }
    await load();
  }, [supabase, currentUserId, householdId, load]);

  const deleteGame = useCallback(async (id: string) => {
    await supabase.from("games").delete().eq("id", id);
    await load();
  }, [supabase, load]);

  // Bulk-add catalogue entries (JSON import). Stamps ownership + household on each
  // row and reloads ONCE, rather than paying saveGame's per-row reload N times.
  // No per-user progress is created — import recreates the shared catalogue only.
  const importGames = useCallback(async (rows: Partial<Game>[]): Promise<number> => {
    if (!rows.length) return 0;
    const stamped = rows.map((r) => ({ ...r, added_by: currentUserId, household_id: householdId }));
    const { data, error } = await supabase.from("games").insert(stamped).select("id");
    await load();
    if (error) throw error;
    return data?.length ?? 0;
  }, [supabase, currentUserId, householdId, load]);

  // Create or update a challenge. New ones are stamped with the current user as
  // creator (RLS requires created_by = auth.uid() on insert, and limits later
  // edits/deletes to the creator).
  const saveChallenge = useCallback(async (c: Partial<Challenge>) => {
    const { id, ...fields } = c as any;
    if (id) await supabase.from("challenges").update(fields).eq("id", id);
    else await supabase.from("challenges").insert({ ...fields, created_by: currentUserId, household_id: householdId });
    await load();
  }, [supabase, currentUserId, householdId, load]);

  const deleteChallenge = useCallback(async (id: string) => {
    await supabase.from("challenges").delete().eq("id", id);
    await load();
  }, [supabase, load]);

  // Persist in-session achievement unlocks (one row per newly crossed tier).
  // Idempotent via the table's unique constraint, so a realtime-triggered
  // re-evaluation that re-derives the same events is a harmless no-op. We don't
  // call load() — realtime delivers the new rows — avoiding a double round-trip
  // and any re-entrancy with the detector.
  const recordUnlock = useCallback(async (events: UnlockEvent[]) => {
    if (!events.length) return;
    const rows = events.map((e) => ({
      household_id: householdId, profile_id: currentUserId,
      achievement_id: e.achievementId, tier: e.tier,
    }));
    await supabase.from("achievement_unlocks")
      .upsert(rows, { onConflict: "household_id,profile_id,achievement_id,tier", ignoreDuplicates: true });
  }, [supabase, currentUserId, householdId]);

  // Persist a shared setting: the PriceCharting feature flag or its token. Both
  // live in the app_settings store. An empty token deletes its row so the "token
  // saved" status stays accurate.
  const saveSettings = useCallback(
    async (key: "pricecharting_enabled" | "pricecharting_token", value: boolean | string) => {
      if (key === "pricecharting_token" && (typeof value !== "string" || value.trim() === "")) {
        await supabase.from("app_settings").delete().eq("household_id", householdId).eq("key", key);
      } else {
        await supabase.from("app_settings").upsert({ household_id: householdId, key, value }, { onConflict: "household_id,key" });
      }
      await load();
    },
    [supabase, householdId, load],
  );

  // Persist the current user's personal preferences (overview layout, etc.).
  // RLS limits the update to the user's own profile row.
  const savePreferences = useCallback(async (preferences: Profile["preferences"]) => {
    await supabase.from("profiles").update({ preferences }).eq("id", currentUserId);
    await load();
  }, [supabase, currentUserId, load]);

  // Persist the current user's editable profile fields (avatar + colour). RLS
  // limits the update to their own row.
  const saveProfile = useCallback(async (fields: { avatar?: string | null; color?: string }) => {
    await supabase.from("profiles").update(fields).eq("id", currentUserId);
    await load();
  }, [supabase, currentUserId, load]);

  // ---- Household management (owner unless noted) ---------------------------
  // Rename the vault. RLS (households_update_owner) restricts this to the owner.
  const renameVault = useCallback(async (name: string) => {
    await supabase.from("households").update({ name: name.trim() }).eq("id", householdId);
    await load();
  }, [supabase, householdId, load]);

  // Roll the invite code via RPC (server-side uniqueness + owner check). Returns
  // the new code so the UI can show it without waiting for the realtime reload.
  const regenerateInvite = useCallback(async (): Promise<string | null> => {
    const { data, error } = await supabase.rpc("regenerate_invite_code", { p_household_id: householdId });
    if (error) throw error;
    await load();
    return (data as string) ?? null;
  }, [supabase, householdId, load]);

  // Owner removes a member (RLS members_delete allows self-or-owner).
  const removeMember = useCallback(async (userId: string) => {
    await supabase.from("household_members").delete().eq("household_id", householdId).eq("user_id", userId);
    await load();
  }, [supabase, householdId, load]);

  // Leave the vault (or, for a sole owner, delete it). The RPC handles owner
  // succession and deleting an emptied vault.
  const leaveVault = useCallback(async () => {
    const { error } = await supabase.rpc("leave_household");
    if (error) throw error;
  }, [supabase]);

  return { games, profiles, members, challenges, unlocks, genres, priceChartingEnabled, priceChartingTokenSet, loading, saveGame, deleteGame, importGames, saveChallenge, deleteChallenge, recordUnlock, saveSettings, savePreferences, saveProfile, renameVault, regenerateInvite, removeMember, leaveVault, reload: load };
}
