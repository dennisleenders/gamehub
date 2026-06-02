"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Game, Profile, PlayStatus } from "@/lib/types";

// Central data layer. Replaces the PoC's in-memory state + window.storage with
// live Supabase queries, while preserving the same shape the UI expects
// (games carry a per-user `progress` map keyed by user id).
export function useVault(currentUserId: string) {
  const supabase = createClient();
  const [games, setGames] = useState<Game[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: gs }, { data: prog }, { data: profs }] = await Promise.all([
      supabase.from("games").select("*").order("created_at", { ascending: false }),
      supabase.from("progress").select("*"),
      supabase.from("profiles").select("*"),
    ]);
    const byGame: Record<string, Game["progress"]> = {};
    (prog ?? []).forEach((p: any) => {
      (byGame[p.game_id] ||= {})![p.user_id] = { status: p.status, hours: Number(p.hours) };
    });
    setGames((gs ?? []).map((g: any) => ({ ...g, progress: byGame[g.id] ?? {} })));
    setProfiles(profs ?? []);
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

  return { games, profiles, loading, saveGame, deleteGame, reload: load };
}
