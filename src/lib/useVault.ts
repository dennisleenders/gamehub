"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_PLATFORMS, DEFAULT_GENRES } from "@/lib/types";
import type { Game, Profile, PlayStatus, Challenge } from "@/lib/types";

// Central data layer. Replaces the PoC's in-memory state + window.storage with
// live Supabase queries, while preserving the same shape the UI expects
// (games carry a per-user `progress` map keyed by user id).
export function useVault(currentUserId: string) {
  const supabase = createClient();
  const [games, setGames] = useState<Game[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  // Shared, household-wide challenges. Only the definitions live in the DB;
  // each user's progress is derived client-side from completions.
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [platforms, setPlatforms] = useState<string[]>(DEFAULT_PLATFORMS);
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
    const [{ data: gs }, { data: prog }, { data: profs }, { data: settings }, { data: runs }, { data: chals }, { count: tokenCount }] = await Promise.all([
      supabase.from("games").select("*").order("created_at", { ascending: false }),
      supabase.from("progress").select("*"),
      supabase.from("profiles").select("*"),
      // Exclude the PriceCharting token row: it must never reach the browser.
      supabase.from("app_settings").select("*").neq("key", "pricecharting_token"),
      supabase.from("playthroughs").select("*"),
      supabase.from("challenges").select("*").order("created_at", { ascending: false }),
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
    // Settings are a small key/value store; fall back to the bundled defaults
    // if the table is empty or hasn't been migrated yet.
    const byKey: Record<string, any> = {};
    (settings ?? []).forEach((s: any) => { byKey[s.key] = s.value; });
    setPlatforms(Array.isArray(byKey.platforms) && byKey.platforms.length ? byKey.platforms : DEFAULT_PLATFORMS);
    setPriceChartingEnabled(byKey.pricecharting_enabled === true);
    setPriceChartingTokenSet((tokenCount ?? 0) > 0);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // Realtime: when either table changes (e.g. your partner adds a game or
  // updates their progress on another device), refresh.
  useEffect(() => {
    const ch = supabase
      .channel("vault")
      .on("postgres_changes", { event: "*", schema: "public", table: "games" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "progress" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "playthroughs" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "challenges" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, load]);

  const saveGame = useCallback(async (g: Partial<Game> & { myStatus?: PlayStatus; myHours?: number }) => {
    const { id, progress, myStatus, myHours, ...fields } = g as any;
    let gameId = id;
    if (id) {
      await supabase.from("games").update(fields).eq("id", id);
    } else {
      const { data } = await supabase
        .from("games")
        .insert({ ...fields, added_by: currentUserId })
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
            hours: existing.hours,
            finished_at: existing.updated_at ?? new Date().toISOString(),
          });
        }
      }
      await supabase.from("progress").upsert({
        game_id: gameId, user_id: currentUserId,
        status: myStatus, hours: myHours ?? 0,
      });
    }
    await load();
  }, [supabase, currentUserId, load]);

  const deleteGame = useCallback(async (id: string) => {
    await supabase.from("games").delete().eq("id", id);
    await load();
  }, [supabase, load]);

  // Create or update a challenge. New ones are stamped with the current user as
  // creator (RLS requires created_by = auth.uid() on insert, and limits later
  // edits/deletes to the creator).
  const saveChallenge = useCallback(async (c: Partial<Challenge>) => {
    const { id, ...fields } = c as any;
    if (id) await supabase.from("challenges").update(fields).eq("id", id);
    else await supabase.from("challenges").insert({ ...fields, created_by: currentUserId });
    await load();
  }, [supabase, currentUserId, load]);

  const deleteChallenge = useCallback(async (id: string) => {
    await supabase.from("challenges").delete().eq("id", id);
    await load();
  }, [supabase, load]);

  // Persist a shared setting: the editable platforms list, the PriceCharting
  // feature flag, or the PriceCharting token. All live in the app_settings store.
  // An empty token deletes its row so the "token saved" status stays accurate.
  const saveSettings = useCallback(
    async (key: "platforms" | "pricecharting_enabled" | "pricecharting_token", value: string[] | boolean | string) => {
      if (key === "pricecharting_token" && (typeof value !== "string" || value.trim() === "")) {
        await supabase.from("app_settings").delete().eq("key", key);
      } else {
        await supabase.from("app_settings").upsert({ key, value });
      }
      await load();
    },
    [supabase, load],
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

  return { games, profiles, challenges, platforms, genres, priceChartingEnabled, priceChartingTokenSet, loading, saveGame, deleteGame, saveChallenge, deleteChallenge, saveSettings, savePreferences, saveProfile, reload: load };
}
