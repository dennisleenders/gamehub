"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { AchievementUnlock, Profile } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { computeRanking, TOTAL_TIERS, highestTier, TIER_COLOR, TIER_LABEL, type UserStats } from "@/lib/achievements";
import { AchievementGrid } from "@/components/achievements/AchievementGrid";
import { AchievementCompare } from "@/components/achievements/AchievementCompare";

// Read-only view of another household member's achievements, opened by tapping a
// leaderboard row. Shows their standing + their grid, with a toggle to compare
// their progress head-to-head with the current user's.
export function MemberSheet({ member, stats, statsByUser, profiles, unlocks, currentUser, onClose }: {
  member: Profile;
  stats: UserStats | undefined;
  statsByUser: Map<string, UserStats>;
  profiles: Profile[];
  unlocks: AchievementUnlock[];
  currentUser: Profile;
  onClose: () => void;
}) {
  useBodyScrollLock();
  const row = computeRanking(statsByUser, profiles).find((r) => r.profile.id === member.id);
  const highest = highestTier(stats);
  // Compare only makes sense for someone other than yourself.
  const canCompare = member.id !== currentUser.id;
  const [mode, setMode] = useState<"grid" | "compare">("grid");

  return (
    <div onClick={onClose} className="sheet-backdrop" style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 620, maxHeight: "calc(94vh - env(safe-area-inset-top))", overflowY: "auto", overflowX: "hidden", background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "20px 20px calc(96px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar user={member} size={42} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{member.name}</div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 8, rowGap: 2, marginTop: 4, fontFamily: "var(--display)", fontSize: 11, color: "var(--ink-dim)" }}>
              <span style={{ whiteSpace: "nowrap" }}>RANK {row ? `#${row.rank}` : "—"}</span>
              <span style={{ whiteSpace: "nowrap" }}>· {row?.points ?? 0} PTS</span>
              <span style={{ whiteSpace: "nowrap" }}>· {row?.tiers ?? 0}/{TOTAL_TIERS} tiers</span>
              {highest && <span style={{ whiteSpace: "nowrap", color: TIER_COLOR[highest] }}>· {TIER_LABEL[highest]}</span>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ display: "grid", placeItems: "center", width: 32, height: 32, flexShrink: 0, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink)", padding: 0 }}><X size={16} /></button>
        </div>

        {canCompare && (
          <div style={{ display: "inline-flex", alignSelf: "flex-start", marginTop: 16, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 4, gap: 4 }}>
            {([["grid", "Achievements"], ["compare", "Compare"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setMode(key)} aria-pressed={mode === key}
                style={{ padding: "7px 14px", borderRadius: "calc(var(--radius) - 3px)", border: "none", cursor: "pointer", fontFamily: "var(--display)", fontWeight: 700, fontSize: 12, background: mode === key ? "var(--accent2)" : "transparent", color: mode === key ? "var(--bg)" : "var(--ink-dim)" }}>
                {label}
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          {canCompare && mode === "compare" ? (
            <AchievementCompare me={currentUser} them={member}
              myStats={statsByUser.get(currentUser.id)} theirStats={stats} />
          ) : (
            <AchievementGrid stats={stats} statsByUser={statsByUser} profiles={profiles}
              unlocks={unlocks} currentUserId={member.id} readOnly />
          )}
        </div>
      </div>
    </div>
  );
}
