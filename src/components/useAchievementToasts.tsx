"use client";

import { useEffect, useRef } from "react";
import { Trophy, Crown } from "lucide-react";
import { ACHIEVEMENTS, computeStatsByUser, evaluateAchievement, TIER_POINTS, TIER_COLOR, TIER_LABEL } from "@/lib/achievements";
import type { Game, Profile } from "@/lib/types";
import { useToast } from "@/components/Toast";

// Watches the current user's achievement tiers and fires a toast each time a new
// tier is reached (e.g. finishing the 10th game unlocks the silver step of
// Completionist). A baseline is recorded silently on the first ready pass so
// existing unlocks don't all fire at once on load — only genuine in-session
// milestones notify. Re-runs whenever the shared data changes, but only the
// current user's (uid) tiers are diffed, so a partner's progress won't notify.
export function useAchievementToasts(games: Game[], profiles: Profile[], uid: string, ready: boolean) {
  const { notify } = useToast();
  const prev = useRef<Record<string, number> | null>(null);

  useEffect(() => {
    if (!ready) return;
    const stats = computeStatsByUser(games, profiles).get(uid);
    const current: Record<string, number> = {};
    for (const def of ACHIEVEMENTS) current[def.id] = evaluateAchievement(def, stats).stepsUnlocked;

    // First ready pass: record the baseline without notifying.
    if (prev.current === null) { prev.current = current; return; }

    for (const def of ACHIEVEMENTS) {
      const before = prev.current[def.id] ?? 0;
      const after = current[def.id];
      // One toast per newly reached tier (handles multi-tier jumps).
      for (let i = before; i < after; i++) {
        const tier = def.steps[i].tier;
        notify({
          title: `${TIER_LABEL[tier]} unlocked`,
          message: `${def.name} · +${TIER_POINTS[tier]} pts`,
          accent: TIER_COLOR[tier],
          icon: tier === "platinum" ? <Crown size={18} /> : <Trophy size={18} />,
        });
      }
    }
    prev.current = current;
  }, [games, profiles, uid, ready, notify]);
}
