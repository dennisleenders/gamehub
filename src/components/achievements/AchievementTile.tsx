"use client";

import {
  Trophy, Hourglass, Repeat, Gamepad2, Compass, CalendarCheck, Library, LibraryBig,
  Flame, Palette, Swords, Anchor, Award, Crown, Lock,
  Wallet, Gem, Star, Joystick, History, Rabbit, Mountain, CalendarRange, Layers, Tv,
  Building2, Moon, Infinity, HeartCrack, type LucideIcon,
} from "lucide-react";
import { TIER_COLOR, TIER_LABEL, type AchievementDef, type AchievementProgress } from "@/lib/achievements";

// Maps an AchievementDef.icon string key → a lucide component. Keeps the engine
// free of any UI import; unknown/absent keys fall back to Award.
export const ICONS: Record<string, LucideIcon> = {
  Trophy, Hourglass, Repeat, Gamepad2, Compass, CalendarCheck, Library, LibraryBig, Flame, Palette, Swords, Anchor, Award,
  Wallet, Gem, Star, Joystick, History, Rabbit, Mountain, CalendarRange, Layers, Tv, Building2, Moon, Infinity, HeartCrack,
};

export function AchievementTile({ def, progress: p, mounted, justUnlocked, onClick }: {
  def: AchievementDef;
  progress: AchievementProgress;
  mounted: boolean;       // false on first paint so the progress bar grows from 0
  justUnlocked?: boolean; // true briefly after an in-session unlock → one-shot glow
  onClick?: () => void;
}) {
  const started = p.stepsUnlocked > 0;
  const maxed = p.nextStep === null;
  const hiddenLocked = !!def.hidden && !started;
  const almost = !maxed && p.nextStep !== null && p.pctToNext >= 80;
  const headColor = p.currentTier ? TIER_COLOR[p.currentTier] : "var(--ink-dim)";
  const barColor = maxed ? TIER_COLOR.platinum : p.nextStep ? TIER_COLOR[p.nextStep.tier] : headColor;
  const Icon = ICONS[def.icon ?? ""] ?? Award;

  const interactive = !!onClick;
  const cls = [justUnlocked ? "tile-unlock" : "", almost ? "tile-almost" : ""].filter(Boolean).join(" ");

  const base: React.CSSProperties = {
    display: "block", width: "100%", textAlign: "left", font: "inherit", color: "var(--ink)",
    background: started
      ? `linear-gradient(150deg, ${headColor}29, var(--panel-alt))`
      : "var(--panel)",
    border: `1px solid ${started ? headColor : "var(--line)"}`,
    borderRadius: "var(--radius)", padding: "14px 14px 13px",
    opacity: started ? 1 : 0.72,
    filter: !started && !hiddenLocked ? "grayscale(0.6)" : undefined,
    cursor: interactive ? "pointer" : "default",
  };

  // ---- Hidden, not yet earned: a teaser tile that reveals nothing. ----------
  if (hiddenLocked) {
    return (
      <div style={{ ...base, opacity: 0.7 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
          <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 99, flexShrink: 0, background: "var(--bg)", border: "1px solid var(--line)" }}>
            <Lock size={13} color="var(--ink-dim)" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: 2 }}>???</div>
            <div style={{ fontSize: 8.5, letterSpacing: 1.2, fontFamily: "var(--display)", fontWeight: 700, color: "var(--ink-dim)", marginTop: 1 }}>SECRET</div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--ink-dim)", lineHeight: 1.4, minHeight: "2.8em" }}>
          A hidden achievement — keep playing to reveal it.
        </div>
      </div>
    );
  }

  const Tag: any = interactive ? "button" : "div";
  return (
    <Tag onClick={onClick} className={cls} style={base}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
        <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 99, flexShrink: 0, background: started ? headColor : "var(--bg)", border: `1px solid ${started ? headColor : "var(--line)"}` }}>
          {maxed
            ? <Crown size={15} color="var(--bg)" fill="var(--bg)" />
            : started
              ? <Icon size={15} strokeWidth={2.5} color="var(--bg)" />
              : <Lock size={13} color="var(--ink-dim)" />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{def.name}</div>
          <div style={{ fontSize: 8.5, letterSpacing: 1.2, fontFamily: "var(--display)", fontWeight: 700, color: headColor, marginTop: 1 }}>
            {maxed ? "MAXED · PLATINUM" : p.currentTier ? TIER_LABEL[p.currentTier] : "LOCKED"}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, color: started ? headColor : "var(--ink-dim)" }}>{p.points}</span>
          <span style={{ fontSize: 9, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>/{p.maxPoints}</span>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: "var(--ink-dim)", lineHeight: 1.4, marginBottom: 11, minHeight: "2.8em" }}>{def.description}</div>

      {/* Tier steps: filled when reached, the next target outlined. */}
      <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
        {def.steps.map((st, i) => {
          const reached = i < p.stepsUnlocked;
          const isNext = i === p.stepsUnlocked;
          const c = TIER_COLOR[st.tier];
          return (
            <div key={st.tier} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ height: 5, borderRadius: 99, background: reached ? c : "var(--bg)", border: `1px solid ${reached || isNext ? c : "var(--line)"}` }} />
              <div style={{ fontSize: 9, fontFamily: "var(--display)", fontWeight: 700, marginTop: 4, textAlign: "center", color: reached ? c : isNext ? "var(--ink)" : "var(--ink-dim)" }}>{st.target}</div>
            </div>
          );
        })}
      </div>

      {/* Progress toward the next tier (or "complete" when maxed). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, color: "var(--ink-dim)", fontFamily: "var(--display)", marginBottom: 6 }}>
        {maxed
          ? <span style={{ color: TIER_COLOR.platinum }}>Fully complete</span>
          : <><span>Next · {TIER_LABEL[p.nextStep!.tier]}</span><span>{Math.min(p.current, p.nextStep!.target)}/{p.nextStep!.target} {def.unit}</span></>}
      </div>
      <div style={{ height: 6, background: "var(--bg)", borderRadius: 99, overflow: "hidden", border: "1px solid var(--line)" }}>
        <div style={{ height: "100%", width: `${mounted ? p.pctToNext : 0}%`, background: barColor, borderRadius: 99, transition: "width .6s cubic-bezier(.2,.8,.2,1)" }} />
      </div>
    </Tag>
  );
}
