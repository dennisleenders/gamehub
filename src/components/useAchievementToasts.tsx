"use client";

import { useEffect, useRef } from "react";
import { Trophy, Crown } from "lucide-react";
import {
  ACHIEVEMENTS, computeStatsByUser, evaluateAchievement, deriveUnlockEvents,
  TIER_POINTS, TIER_COLOR, TIER_LABEL,
} from "@/lib/achievements";
import type { UnlockEvent } from "@/lib/achievements";
import type { Game, Profile } from "@/lib/types";
import { useToast } from "@/components/Toast";

// Map an achievement id → its definition for quick lookup in the event loop.
const DEF_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((d) => [d.id, d]));

// Watches the current user's achievement tiers and, each time a new tier is
// reached (e.g. finishing the 10th game unlocks Completionist's silver step):
//   1. fires a milestone toast,
//   2. persists the unlock (recordUnlock) so the timeline/timestamps survive,
//   3. triggers the on-page celebration (onCelebrate → confetti + tile glow).
// A baseline is recorded silently on the first ready pass so existing unlocks
// don't all fire at once on load — only genuine in-session milestones notify.
// Re-runs whenever the shared data changes, but only the current user's (uid)
// tiers are diffed, so a partner's progress won't notify.
export function useAchievementToasts(
  games: Game[],
  profiles: Profile[],
  uid: string,
  ready: boolean,
  opts?: {
    recordUnlock?: (events: UnlockEvent[]) => void | Promise<void>;
    onCelebrate?: (events: UnlockEvent[]) => void;
  },
) {
  const { notify } = useToast();
  const prev = useRef<Record<string, number> | null>(null);
  // Keep the latest callbacks in a ref so they don't need to be effect deps
  // (avoids re-running the diff — and re-firing — on every parent render).
  const cbs = useRef(opts);
  cbs.current = opts;

  useEffect(() => {
    if (!ready) return;
    const stats = computeStatsByUser(games, profiles).get(uid);
    const current: Record<string, number> = {};
    for (const def of ACHIEVEMENTS) current[def.id] = evaluateAchievement(def, stats).stepsUnlocked;

    // First ready pass: record the baseline without notifying.
    if (prev.current === null) { prev.current = current; return; }

    const events = deriveUnlockEvents(prev.current, current);
    prev.current = current;
    if (events.length === 0) return;

    for (const e of events) {
      const def = DEF_BY_ID[e.achievementId];
      notify({
        title: `${TIER_LABEL[e.tier]} unlocked`,
        message: `${def?.name ?? "Achievement"} · +${TIER_POINTS[e.tier]} pts`,
        accent: TIER_COLOR[e.tier],
        icon: e.tier === "platinum" ? <Crown size={18} /> : <Trophy size={18} />,
      });
    }
    cbs.current?.onCelebrate?.(events);
    cbs.current?.recordUnlock?.(events);
  }, [games, profiles, uid, ready, notify]);
}
