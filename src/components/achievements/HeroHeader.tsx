"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import type { Profile } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { useCountUp } from "@/lib/useCountUp";
import { TIER_COLOR, TIER_LABEL, type Tier } from "@/lib/achievements";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Personal summary banner at the top of the Achievements page: avatar, name,
// household rank, total points (count-up), highest tier earned, and a tiers-
// unlocked progress ring. Purely presentational — every value is derived by the
// caller from the shared stats/ranking (computed once there).
export function HeroHeader({
  profile, rank, totalMembers, points, tiersUnlocked, totalTiers, highest,
}: {
  profile: Profile;
  rank: number;
  totalMembers: number;
  points: number;
  tiersUnlocked: number;
  totalTiers: number;
  highest: Tier | null;
}) {
  const shownPoints = useCountUp(points);
  const shownTiers = useCountUp(tiersUnlocked, 1100);

  const SIZE = 78, STROKE = 7;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const pct = totalTiers > 0 ? tiersUnlocked / totalTiers : 0;
  const ringColor = highest ? TIER_COLOR[highest] : "var(--accent3)";

  // Fill the ring from empty on mount: start at full offset, then animate to the
  // real value one frame later so the CSS transition plays.
  const [offset, setOffset] = useState(C);
  useEffect(() => {
    const target = C * (1 - pct);
    if (prefersReducedMotion()) { setOffset(target); return; }
    const id = requestAnimationFrame(() => setOffset(target));
    return () => cancelAnimationFrame(id);
  }, [C, pct]);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16, padding: "16px 18px",
      background: `linear-gradient(150deg, ${ringColor}1f, var(--panel-alt))`,
      border: "1px solid var(--line)", borderRadius: "var(--radius)",
    }}>
      <Avatar user={profile} size={46} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {profile.name}
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 3, fontFamily: "var(--display)", fontSize: 11, color: "var(--ink-dim)" }}>
          <Trophy size={12} color="var(--accent3)" />
          RANK {totalMembers > 0 ? `#${rank} of ${totalMembers}` : "—"}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
          <div>
            <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 24, color: "var(--ink)" }}>{shownPoints.toLocaleString("nl-NL")}</span>
            <span style={{ fontSize: 10, color: "var(--ink-dim)", fontFamily: "var(--display)", marginLeft: 5 }}>PTS</span>
          </div>
          {highest && (
            <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 99, fontSize: 9.5, letterSpacing: 1.2, fontFamily: "var(--display)", fontWeight: 700, color: TIER_COLOR[highest], border: `1px solid ${TIER_COLOR[highest]}`, background: `${TIER_COLOR[highest]}1f` }}>
              {TIER_LABEL[highest]}
            </span>
          )}
        </div>
      </div>

      <div style={{ position: "relative", width: SIZE, height: SIZE, flexShrink: 0 }}>
        <svg width={SIZE} height={SIZE} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--line)" strokeWidth={STROKE} />
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={ringColor} strokeWidth={STROKE}
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
          <div>
            <div style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 16, lineHeight: 1 }}>{shownTiers}</div>
            <div style={{ fontSize: 9, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 1 }}>/{totalTiers}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
