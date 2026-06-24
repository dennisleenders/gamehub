"use client";

import { useMemo, useState } from "react";
import {
  Trophy, Crown, Plus, X, Check, ChevronDown, Flag, Award, Hourglass, CalendarClock,
} from "lucide-react";
import type { AchievementUnlock, Challenge, ChallengeType, Game, Profile } from "@/lib/types";
import { fmtDate } from "@/lib/types";
import { Avatar } from "@/components/Avatar";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import {
  computeStatsByUser, computeRanking, challengeStandings, challengePhase,
  highestTier, TOTAL_TIERS, type RankRow,
} from "@/lib/achievements";
import { HeroHeader } from "@/components/achievements/HeroHeader";
import { AchievementGrid } from "@/components/achievements/AchievementGrid";
import { MemberSheet } from "@/components/achievements/MemberSheet";

const CHALLENGE_TYPES: [ChallengeType, string][] = [["complete_games", "Complete games"]];

function SectionHead({ icon: Icon, accent, action, children }: { icon: any; accent: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <Icon size={15} color={accent} />
      <span style={{ fontSize: 12, letterSpacing: 1.5, fontFamily: "var(--display)", fontWeight: 700 }}>{children}</span>
      {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
    </div>
  );
}

export default function AchievementsView({
  games, profiles, challenges, currentUser, unlocks = [], justUnlocked, deleteChallenge, onCreateChallenge,
}: {
  games: Game[];
  profiles: Profile[];
  challenges: Challenge[];
  currentUser: Profile;
  unlocks?: AchievementUnlock[];
  justUnlocked?: Set<string>;
  deleteChallenge: (id: string) => Promise<void> | void;
  onCreateChallenge: () => void;
}) {
  // Compute the shared stats ONCE and pass them to every consumer (hero, ranking,
  // grid, detail coverage) — avoids the previous triple computeStatsByUser.
  const statsByUser = useMemo(() => computeStatsByUser(games, profiles), [games, profiles]);
  const ranking = useMemo(() => computeRanking(statsByUser, profiles), [statsByUser, profiles]);
  const myStats = statsByUser.get(currentUser.id);
  const myRow = ranking.find((r) => r.profile.id === currentUser.id);
  // A member tapped in the leaderboard opens their read-only achievement grid.
  const [member, setMember] = useState<Profile | null>(null);

  return (
    <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <HeroHeader profile={currentUser}
        rank={myRow?.rank ?? 0} totalMembers={profiles.length}
        points={myRow?.points ?? 0} tiersUnlocked={myRow?.tiers ?? 0}
        totalTiers={TOTAL_TIERS} highest={highestTier(myStats)} />

      {/* ---- Ranking ---- */}
      <section>
        <SectionHead icon={Trophy} accent="var(--accent3)">RANKING</SectionHead>
        <RankingBoard games={games} profiles={profiles} currentUser={currentUser} ranking={ranking} onSelectMember={setMember} />
      </section>

      {/* ---- Challenges ---- */}
      <section>
        <SectionHead icon={Flag} accent="var(--accent2)"
          action={
            <button onClick={onCreateChallenge}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", border: "none", borderRadius: 99, cursor: "pointer", background: "var(--accent2)", color: "var(--bg)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 11 }}>
              <Plus size={14} strokeWidth={3} /> NEW
            </button>
          }>
          CHALLENGES
        </SectionHead>
        {challenges.length === 0 ? (
          <div style={{ textAlign: "center", padding: "44px 0", color: "var(--ink-dim)", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)" }}>
            <Flag size={34} style={{ opacity: .5, margin: "0 auto" }} />
            <div style={{ marginTop: 12, fontFamily: "var(--display)", fontSize: 13 }}>NO CHALLENGES YET</div>
            <div style={{ marginTop: 6, fontSize: 13 }}>Start one — everyone in the household races toward it.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {challenges.map((c) => (
              <ChallengeCard key={c.id} challenge={c} games={games} profiles={profiles} currentUser={currentUser} onDelete={deleteChallenge} />
            ))}
          </div>
        )}
      </section>

      {/* ---- Achievements ---- */}
      <section>
        <SectionHead icon={Award} accent="var(--accent)">ACHIEVEMENTS</SectionHead>
        <AchievementGrid stats={myStats} statsByUser={statsByUser} profiles={profiles}
          unlocks={unlocks} currentUserId={currentUser.id} justUnlocked={justUnlocked} />
      </section>

      {member && (
        <MemberSheet member={member} stats={statsByUser.get(member.id)} statsByUser={statsByUser}
          profiles={profiles} unlocks={unlocks} currentUser={currentUser} onClose={() => setMember(null)} />
      )}
    </div>
  );
}

// The points leaderboard. Used on both the Achievements page (where the parent
// passes a precomputed `ranking` to avoid recomputing) and the dashboard (where
// it falls back to computing its own from games/profiles). When `onSelectMember`
// is provided, rows become buttons that open that member's achievement grid.
export function RankingBoard({ games, profiles, currentUser, ranking: rankingProp, onSelectMember }: {
  games: Game[];
  profiles: Profile[];
  currentUser: Profile;
  ranking?: RankRow[];
  onSelectMember?: (p: Profile) => void;
}) {
  const ranking = useMemo(
    () => rankingProp ?? computeRanking(computeStatsByUser(games, profiles), profiles),
    [rankingProp, games, profiles],
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {ranking.map((row) => {
        const mine = row.profile.id === currentUser.id;
        const top = row.rank === 1 && row.points > 0;
        const clickable = !!onSelectMember;
        const Tag: any = clickable ? "button" : "div";
        return (
          <Tag key={row.profile.id} onClick={clickable ? () => onSelectMember!(row.profile) : undefined} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: "var(--radius)",
            background: "var(--panel)", border: `1px solid ${mine ? row.profile.color : "var(--line)"}`,
            width: "100%", textAlign: "left", font: "inherit", color: "var(--ink)", cursor: clickable ? "pointer" : "default",
          }}>
            <div style={{ width: 26, display: "grid", placeItems: "center", flexShrink: 0 }}>
              {top
                ? <Crown size={18} color="var(--accent3)" fill="var(--accent3)" />
                : <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 15, color: "var(--ink-dim)" }}>{row.rank}</span>}
            </div>
            <Avatar user={row.profile} size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {row.profile.name}{mine && <span style={{ color: "var(--ink-dim)", fontWeight: 600 }}> · you</span>}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)", marginTop: 2 }}>
                {row.tiers}/{TOTAL_TIERS} tiers
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: top ? "var(--accent3)" : "var(--ink)" }}>{row.points}</span>
              <span style={{ fontSize: 10, color: "var(--ink-dim)", fontFamily: "var(--display)", marginLeft: 5 }}>PTS</span>
            </div>
          </Tag>
        );
      })}
    </div>
  );
}

function ChallengeCard({ challenge: c, games, profiles, currentUser, onDelete }: {
  challenge: Challenge; games: Game[]; profiles: Profile[]; currentUser: Profile; onDelete: (id: string) => Promise<void> | void;
}) {
  const [confirming, setConfirming] = useState(false);
  const standings = challengeStandings(c, games, profiles);
  const phase = challengePhase(c);
  const mine = c.created_by === currentUser.id;
  const leader = standings.find((s) => s.done) ?? null;

  const phaseHint =
    phase === "upcoming" ? { icon: CalendarClock, text: `Starts ${fmtDate(c.period_start)}`, color: "var(--ink-dim)" } :
    phase === "ended" ? { icon: Hourglass, text: `Ended ${fmtDate(c.period_end)}`, color: "var(--ink-dim)" } :
    null;

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "15px 16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.25 }}>{c.title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6, fontSize: 11, color: "var(--ink-dim)", fontFamily: "var(--display)" }}>
            <span style={{ color: "var(--accent2)", fontWeight: 700 }}>{c.target} games</span>
            <span>·</span>
            <span>{fmtDate(c.period_start)} – {fmtDate(c.period_end)}</span>
            {phaseHint && (() => {
              const HintIcon = phaseHint.icon;
              return (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: phaseHint.color }}>
                  · <HintIcon size={12} /> {phaseHint.text}
                </span>
              );
            })()}
          </div>
        </div>
        {mine && (
          confirming ? (
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={() => onDelete(c.id)} style={{ padding: "5px 9px", border: "1px solid var(--bad)", borderRadius: 8, cursor: "pointer", background: "transparent", color: "var(--bad)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 10 }}>DELETE</button>
              <button onClick={() => setConfirming(false)} style={{ padding: "5px 9px", border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer", background: "transparent", color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 10 }}>KEEP</button>
            </div>
          ) : (
            <button onClick={() => setConfirming(true)} aria-label="Delete challenge"
              style={{ display: "grid", placeItems: "center", width: 28, height: 28, flexShrink: 0, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink-dim)", padding: 0 }}>
              <X size={14} />
            </button>
          )
        )}
      </div>

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 11 }}>
        {standings.map((s) => {
          const me = s.profile.id === currentUser.id;
          return (
            <div key={s.profile.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar user={s.profile} size={24} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {s.profile.name}{me && <span style={{ color: "var(--ink-dim)", fontWeight: 600 }}> · you</span>}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, fontFamily: "var(--display)", fontSize: 12, color: s.done ? "var(--good)" : "var(--ink-dim)" }}>
                    {s.done && <Check size={13} strokeWidth={3} />}{s.count}/{c.target}
                  </span>
                </div>
                <div style={{ height: 8, background: "var(--bg)", borderRadius: 99, overflow: "hidden", border: "1px solid var(--line)" }}>
                  <div style={{ height: "100%", width: `${s.pct}%`, background: s.done ? "var(--good)" : s.profile.color, borderRadius: 99, transition: "width .3s" }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {leader && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--good)", fontFamily: "var(--display)" }}>
          <Trophy size={13} /> {leader.profile.name} {phase === "ended" ? "won" : "reached the goal"}!
        </div>
      )}
    </div>
  );
}

export function CreateChallengeModal({ currentUser, onClose, onSave }: {
  currentUser: Profile;
  onClose: () => void;
  onSave: (c: Partial<Challenge>) => Promise<void> | void;
}) {
  useBodyScrollLock();
  const year = new Date().getFullYear();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ChallengeType>("complete_games");
  const [target, setTarget] = useState("");
  const [periodStart, setPeriodStart] = useState(`${year}-01-01`);
  const [periodEnd, setPeriodEnd] = useState(`${year}-12-31`);
  const [saving, setSaving] = useState(false);

  const targetNum = Number(target);
  const valid = title.trim() !== "" && targetNum > 0 && periodStart !== "" && periodEnd !== "" && periodEnd >= periodStart;

  const inp: React.CSSProperties = { width: "100%", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)", color: "var(--ink)", padding: "10px 12px", fontSize: 14, fontFamily: "var(--body)", outline: "none", boxSizing: "border-box" };
  const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, marginBottom: 6, display: "block" };

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), type, target: targetNum, period_start: periodStart, period_end: periodEnd });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }} className="sheet-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, maxHeight: "calc(94vh - env(safe-area-inset-top))", overflowY: "auto", overflowX: "hidden", background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "20px 20px calc(20px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 16, color: "var(--accent)" }}>NEW CHALLENGE</div>
          <button onClick={onClose} style={{ display: "grid", placeItems: "center", width: 32, height: 32, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink)", padding: 0 }}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.5, marginBottom: 20 }}>
          A shared goal everyone in the household races toward. {currentUser.name}, you can edit or delete it later.
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>TITLE</label>
          <input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Finish 50 games in ${year}`} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={lbl}>GOAL</label>
            <div style={{ position: "relative" }}>
              <select value={type} onChange={(e) => setType(e.target.value as ChallengeType)} style={{ ...inp, cursor: "pointer", appearance: "none", WebkitAppearance: "none", MozAppearance: "none", paddingRight: 34 }}>
                {CHALLENGE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <ChevronDown size={16} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--ink-dim)" }} />
            </div>
          </div>
          <div>
            <label style={lbl}>GAMES TO COMPLETE</label>
            <input style={inp} type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="50" />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div><label style={lbl}>FROM</label><input style={inp} type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
          <div><label style={lbl}>UNTIL</label><input style={inp} type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
        </div>
        {periodEnd < periodStart && (
          <div style={{ fontSize: 11.5, color: "var(--bad)", fontFamily: "var(--display)", marginTop: -12, marginBottom: 16 }}>End date must be on or after the start date.</div>
        )}

        <button onClick={submit} disabled={!valid || saving}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 0", border: "none", borderRadius: "var(--radius)", cursor: valid && !saving ? "pointer" : "not-allowed", background: "var(--accent2)", color: "var(--bg)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 14, opacity: valid && !saving ? 1 : 0.5 }}>
          <Check size={17} strokeWidth={3} /> START CHALLENGE
        </button>
      </div>
    </div>
  );
}
