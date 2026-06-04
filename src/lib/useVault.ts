"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_PLATFORMS, DEFAULT_GENRES } from "@/lib/types";
import type { Game, Profile, PlayStatus } from "@/lib/types";

// Central data layer. Replaces the PoC's in-memory state + window.storage with
// live Supabase queries, while preserving the same shape the UI expects
// (games carry a per-user `progress` map keyed by user id).
export function useVault(currentUserId: string) {
  const supabase = createClient();
  const [games, setGames] = useState<Game[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [platforms, setPlatforms] = useState<string[]>(DEFAULT_PLATFORMS);
  // Genres are a fixed, app-defined list — not user-editable.
  const genres = DEFAULT_GENRES;
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: gs }, { data: prog }, { data: profs }, { data: settings }, { data: runs }] = await Promise.all([
      supabase.from("games").select("*").order("created_at", { ascending: false }),
      supabase.from("progress").select("*"),
      supabase.from("profiles").select("*"),
      supabase.from("app_settings").select("*"),
      supabase.from("playthroughs").select("*"),
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
    // Settings are a small key/value store; fall back to the bundled defaults
    // if the table is empty or hasn't been migrated yet.
    const byKey: Record<string, any> = {};
    (settings ?? []).forEach((s: any) => { byKey[s.key] = s.value; });
    setPlatforms(Array.isArray(byKey.platforms) && byKey.platforms.length ? byKey.platforms : DEFAULT_PLATFORMS);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "playthroughs" }, load)
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

  // Persist the editable platforms list to the shared settings store.
  const saveSettings = useCallback(async (key: "platforms", value: string[]) => {
    await supabase.from("app_settings").upsert({ key, value });
    await load();
  }, [supabase, load]);

  return { games, profiles, platforms, genres, loading, saveGame, deleteGame, saveSettings, reload: load };
}
