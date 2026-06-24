"use client";

import { X, Check, Lock, Crown, Users, Award } from "lucide-react";
import type { AchievementUnlock, Profile } from "@/lib/types";
import { fmtDate } from "@/lib/types";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import {
  TIER_COLOR, TIER_LABEL, TIER_POINTS, tierCoverage, remainingToNext, unlockedAtFor,
  type AchievementDef, type AchievementProgress, type UserStats,
} from "@/lib/achievements";
import { ICONS } from "@/components/achievements/AchievementTile";

// Tap-through detail for one achievement: the full tier ladder with point values,
// how far to the next tier, household coverage per tier, and the real unlock date
// for tiers the user has stored (— for older / not-yet-earned tiers).
export function AchievementDetailSheet({
  def, progress: p, statsByUser, profiles, unlocks, currentUserId, onClose,
}: {
  def: AchievementDef;
  progress: AchievementProgress;
  statsByUser: Map<string, UserStats>;
  profiles: Profile[];
  unlocks: AchievementUnlock[];
  currentUserId: string;
  onClose: () => void;
}) {
  useBodyScrollLock();
  const maxed = p.nextStep === null;
  const headColor = p.currentTier ? TIER_COLOR[p.currentTier] : "var(--accent)";
  const Icon = ICONS[def.icon ?? ""] ?? Award;
  const rem = remainingToNext(p);

  return (
    <div onClick={onClose} className="sheet-backdrop" style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, maxHeight: "calc(94vh - env(safe-area-inset-top))", overflowY: "auto", overflowX: "hidden", background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "20px 20px calc(96px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span style={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: `linear-gradient(150deg, ${headColor}33, var(--panel-alt))`, border: `1px solid ${headColor}` }}>
            {maxed ? <Crown size={20} color={headColor} fill={headColor} /> : <Icon size={20} color={headColor} />}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{def.name}</div>
            <div style={{ fontSize: 9.5, letterSpacing: 1.2, fontFamily: "var(--display)", fontWeight: 700, color: headColor, marginTop: 3 }}>
              {maxed ? "MAXED · PLATINUM" : p.currentTier ? `${TIER_LABEL[p.currentTier]} · ${p.points}/${p.maxPoints} PTS` : `LOCKED · 0/${p.maxPoints} PTS`}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ display: "grid", placeItems: "center", width: 32, height: 32, flexShrink: 0, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink)", padding: 0 }}><X size={16} /></button>
        </div>

        <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.5, margin: "14px 0 4px" }}>{def.description}</div>

        {/* Distance to next tier + overall bar. */}
        {rem ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontFamily: "var(--display)", color: "var(--ink-dim)", marginBottom: 6 }}>
              <span style={{ color: TIER_COLOR[rem.tier] }}>{rem.remaining} more {def.unit} to {TIER_LABEL[rem.tier]}</span>
              <span>{Math.min(p.current, p.nextStep!.target)}/{p.nextStep!.target}</span>
            </div>
            <div style={{ height: 8, background: "var(--bg)", borderRadius: 99, overflow: "hidden", border: "1px solid var(--line)" }}>
              <div style={{ height: "100%", width: `${p.pctToNext}%`, background: TIER_COLOR[rem.tier], borderRadius: 99, transition: "width .4s" }} />
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 14, fontSize: 12, fontFamily: "var(--display)", color: TIER_COLOR.platinum }}>Fully complete — every tier earned.</div>
        )}

        {/* Tier ladder. */}
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          {def.steps.map((st, i) => {
            const reached = i < p.stepsUnlocked;
            const isNext = i === p.stepsUnlocked;
            const c = TIER_COLOR[st.tier];
            const cov = tierCoverage(def, st.tier, statsByUser, profiles);
            const at = unlockedAtFor(unlocks, currentUserId, def.id, st.tier);
            return (
              <div key={st.tier} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: "var(--radius)",
                background: reached ? `${c}1a` : "var(--bg)", border: `1px solid ${reached ? c : isNext ? "var(--ink-dim)" : "var(--line)"}`,
                opacity: reached || isNext ? 1 : 0.6,
              }}>
                <span style={{ display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 99, flexShrink: 0, background: reached ? c : "var(--panel)", border: `1px solid ${reached ? c : "var(--line)"}` }}>
                  {reached ? <Check size={14} strokeWidth={3} color="var(--bg)" /> : <Lock size={12} color="var(--ink-dim)" />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 11.5, letterSpacing: 1, color: reached ? c : "var(--ink)" }}>{TIER_LABEL[st.tier]}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>{st.target} {def.unit}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 3, fontSize: 10.5, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Users size={11} /> {cov.holders}/{cov.total}</span>
                    {reached && <span>· {at ? fmtDate(at) : "earned"}</span>}
                  </div>
                </div>
                <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 13, flexShrink: 0, color: reached ? c : "var(--ink-dim)" }}>+{TIER_POINTS[st.tier]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
