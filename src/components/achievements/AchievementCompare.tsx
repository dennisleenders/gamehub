"use client";

import { Crown, Award } from "lucide-react";
import type { Profile } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import {
  ACHIEVEMENTS, evaluateAchievement, totalPoints, tiersUnlocked, TOTAL_TIERS,
  TIER_COLOR, TIER_LABEL, type Tier, type UserStats,
} from "@/lib/achievements";
import { ICONS } from "@/components/achievements/AchievementTile";

// Head-to-head comparison of the current user vs another member: an overall
// summary, then one card per achievement with both players' completion bars and
// a crown on whoever leads each. Achievement completion is measured by points
// earned / max points (so a higher tier always reads as further along).
export function AchievementCompare({ me, them, myStats, theirStats }: {
  me: Profile;
  them: Profile;
  myStats: UserStats | undefined;
  theirStats: UserStats | undefined;
}) {
  const myPts = totalPoints(myStats);
  const theirPts = totalPoints(theirStats);

  // Skip hidden achievements neither player has started, so secrets stay secret.
  const rows = ACHIEVEMENTS
    .map((def) => ({ def, mine: evaluateAchievement(def, myStats), theirs: evaluateAchievement(def, theirStats) }))
    .filter(({ def, mine, theirs }) => !(def.hidden && mine.stepsUnlocked === 0 && theirs.stepsUnlocked === 0));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Overall summary. */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 10, padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--panel-alt)", border: "1px solid var(--line)" }}>
        <Side profile={me} label="You" pts={myPts} tiers={tiersUnlocked(myStats)} lead={myPts > theirPts} align="left" />
        <div style={{ display: "grid", placeItems: "center", fontFamily: "var(--display)", fontSize: 11, color: "var(--ink-dim)" }}>VS</div>
        <Side profile={them} label={them.name} pts={theirPts} tiers={tiersUnlocked(theirStats)} lead={theirPts > myPts} align="right" />
      </div>

      {rows.map(({ def, mine, theirs }) => {
        const Icon = ICONS[def.icon ?? ""] ?? Award;
        const maxP = mine.maxPoints || 1;
        const leader = mine.points === theirs.points ? "tie" : mine.points > theirs.points ? "me" : "them";
        return (
          <div key={def.id} style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Icon size={14} color="var(--ink-dim)" />
              <span style={{ fontSize: 13, fontWeight: 800 }}>{def.name}</span>
            </div>
            <Bar profile={me} pct={(mine.points / maxP) * 100} tier={mine.currentTier} points={mine.points} maxPoints={maxP} winner={leader === "me"} />
            <div style={{ height: 7 }} />
            <Bar profile={them} pct={(theirs.points / maxP) * 100} tier={theirs.currentTier} points={theirs.points} maxPoints={maxP} winner={leader === "them"} />
          </div>
        );
      })}
    </div>
  );
}

function Side({ profile, label, pts, tiers, lead, align }: {
  profile: Profile; label: string; pts: number; tiers: number; lead: boolean; align: "left" | "right";
}) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: align === "left" ? "flex-start" : "flex-end", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexDirection: align === "left" ? "row" : "row-reverse" }}>
        <Avatar user={profile} size={24} />
        <span style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 90 }}>{label}</span>
        {lead && <Crown size={13} color="var(--accent3)" fill="var(--accent3)" />}
      </div>
      <div style={{ fontFamily: "var(--display)", fontSize: 18, fontWeight: 700, color: lead ? "var(--accent3)" : "var(--ink)" }}>
        {pts}<span style={{ fontSize: 9, color: "var(--ink-dim)", marginLeft: 4 }}>PTS</span>
      </div>
      <div style={{ fontFamily: "var(--display)", fontSize: 10, color: "var(--ink-dim)" }}>{tiers}/{TOTAL_TIERS} tiers</div>
    </div>
  );
}

function Bar({ profile, pct, tier, points, maxPoints, winner }: {
  profile: Profile; pct: number; tier: Tier | null; points: number; maxPoints: number; winner: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Avatar user={profile} size={20} />
      <div style={{ flex: 1, minWidth: 0, height: 8, background: "var(--bg)", borderRadius: 99, overflow: "hidden", border: "1px solid var(--line)" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: profile.color, borderRadius: 99, transition: "width .4s" }} />
      </div>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 4, flexShrink: 0, width: 78, fontFamily: "var(--display)", fontSize: 10.5, color: tier ? TIER_COLOR[tier] : "var(--ink-dim)" }}>
        {winner && <Crown size={11} color="var(--accent3)" fill="var(--accent3)" />}
        <span>{tier ? TIER_LABEL[tier][0] : "—"}</span>
        <span style={{ color: "var(--ink)" }}>{points}</span>
        <span style={{ color: "var(--ink-dim)" }}>/{maxPoints}</span>
      </span>
    </div>
  );
}
