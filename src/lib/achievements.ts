// Achievement engine — pure logic, no UI, no DB.
//
// Achievements and the ranking are NOT stored: they're computed live from the
// same data useVault already loads (games carrying per-user `progress` +
// `playthroughs`). This matches the rest of the app (recently-played, by-system,
// collection value are all derived per render) and is real-time for free.
//
// The one true completion primitive (see migration 0003_playthroughs.sql):
//   completions(game, user) = playthroughs[uid].length
//                           + (progress[uid].status === "finished" ? 1 : 0)
// Completion timestamps: archived runs use playthroughs.finished_at (the real
// finish moment, preserved on replay); the live finished run uses
// progress.updated_at.
//
// Known limitation (accepted): the live finished run is timestamped by
// progress.updated_at, which a DB trigger bumps on ANY edit. So a game finished
// in 2025 whose hours are edited in 2026 counts toward a 2026 window, and
// deleting a game can re-lock an achievement / lower points. Fine for a
// household; exactness would need a stored unlock/finish history.

import type { Challenge, Game, Profile } from "@/lib/types";

export type Tier = "bronze" | "silver" | "gold" | "platinum";

export const TIER_POINTS: Record<Tier, number> = {
  bronze: 10,
  silver: 25,
  gold: 50,
  platinum: 100,
};

// Shared tier presentation, used by the achievement grid and the milestone toasts.
export const TIER_COLOR: Record<Tier, string> = {
  bronze: "var(--accent3)",
  silver: "var(--ink-dim)",
  gold: "var(--accent)",
  platinum: "var(--accent2)",
};
export const TIER_LABEL: Record<Tier, string> = {
  bronze: "BRONZE",
  silver: "SILVER",
  gold: "GOLD",
  platinum: "PLATINUM",
};

export interface UserStats {
  completions: number;          // total finishes, replays included
  distinctGamesFinished: number; // games finished at least once
  replayedGames: number;        // games finished 2+ times
  maxReplays: number;           // most completions on a single game
  totalHours: number;           // hours across all touched games + archived runs
  platformsFinished: Set<string>;
  genresFinished: Set<string>;
  finishesByYear: Record<number, number>;
  gamesAdded: number;           // games this user added to the shared collection
}

export const emptyStats = (): UserStats => ({
  completions: 0,
  distinctGamesFinished: 0,
  replayedGames: 0,
  maxReplays: 0,
  totalHours: 0,
  platformsFinished: new Set<string>(),
  genresFinished: new Set<string>(),
  finishesByYear: {},
  gamesAdded: 0,
});

const bumpYear = (s: UserStats, iso?: string | null) => {
  if (!iso) return;
  const y = new Date(iso).getFullYear();
  if (!Number.isNaN(y)) s.finishesByYear[y] = (s.finishesByYear[y] ?? 0) + 1;
};

// Single O(games × users) pass. Compute this once per render and reuse for every
// achievement + the ranking — never recompute inside an achievement.
export function computeStatsByUser(games: Game[], profiles: Profile[]): Map<string, UserStats> {
  const stats = new Map<string, UserStats>();
  const statsFor = (uid: string) => {
    let s = stats.get(uid);
    if (!s) { s = emptyStats(); stats.set(uid, s); }
    return s;
  };
  // Seed every profile so a member with zero activity still appears in the ranking.
  profiles.forEach((p) => statsFor(p.id));

  for (const g of games) {
    if (g.added_by) statsFor(g.added_by).gamesAdded += 1;

    // Union of users who have either a progress row or archived runs on this game.
    const uids = new Set<string>([
      ...Object.keys(g.progress ?? {}),
      ...Object.keys(g.playthroughs ?? {}),
    ]);

    for (const uid of uids) {
      const s = statsFor(uid);
      const runs = g.playthroughs?.[uid] ?? [];
      const live = g.progress?.[uid];
      const liveFinished = live?.status === "finished";
      const count = runs.length + (liveFinished ? 1 : 0);

      // Hours: time invested across every touched game (any status) + archived
      // runs. Values are already Number-coerced by useVault.
      if (live) s.totalHours += live.hours || 0;
      for (const r of runs) s.totalHours += r.hours || 0;

      if (count === 0) continue;
      s.completions += count;
      s.distinctGamesFinished += 1;
      if (count >= 2) s.replayedGames += 1;
      s.maxReplays = Math.max(s.maxReplays, count);
      if (g.platform) s.platformsFinished.add(g.platform);
      if (g.genre) s.genresFinished.add(g.genre);
      for (const r of runs) bumpYear(s, r.finished_at);
      if (liveFinished) bumpYear(s, live!.updated_at);
    }
  }
  return stats;
}

const maxYear = (s: UserStats) => {
  const vals = Object.values(s.finishesByYear);
  return vals.length ? Math.max(...vals) : 0;
};

// Tiers in ascending order — the step sequence every achievement climbs.
export const TIER_ORDER: Tier[] = ["bronze", "silver", "gold", "platinum"];

export interface AchievementStep {
  tier: Tier;
  target: number;
}

// A stepped achievement: ONE metric with ascending tier targets. Reaching a tier
// awards its TIER_POINTS, so a single achievement yields increasing points as the
// user climbs bronze → silver → gold → platinum. `unit` labels the progress bar.
export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  unit: string;
  metric: (s: UserStats) => number;
  steps: AchievementStep[]; // ascending by target
}

// The catalog: each entry is one achievement with four steps. Targets are tuned
// to the default 7 platforms / 6 genres and live here so balancing is one file.
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "completionist", name: "Completionist", description: "Finish games in your collection.", unit: "games",
    metric: (s) => s.completions,
    steps: [{ tier: "bronze", target: 1 }, { tier: "silver", target: 10 }, { tier: "gold", target: 50 }, { tier: "platinum", target: 100 }],
  },
  {
    id: "time_served", name: "Time Served", description: "Log hours across your games.", unit: "h",
    metric: (s) => Math.floor(s.totalHours),
    steps: [{ tier: "bronze", target: 10 }, { tier: "silver", target: 100 }, { tier: "gold", target: 500 }, { tier: "platinum", target: 1000 }],
  },
  {
    id: "encore", name: "Encore", description: "Complete the same game more than once.", unit: "games",
    metric: (s) => s.replayedGames,
    steps: [{ tier: "bronze", target: 1 }, { tier: "silver", target: 5 }, { tier: "gold", target: 15 }, { tier: "platinum", target: 30 }],
  },
  {
    id: "platform_hopper", name: "Platform Hopper", description: "Finish games on different systems.", unit: "systems",
    metric: (s) => s.platformsFinished.size,
    steps: [{ tier: "bronze", target: 2 }, { tier: "silver", target: 3 }, { tier: "gold", target: 4 }, { tier: "platinum", target: 5 }],
  },
  {
    id: "genre_explorer", name: "Genre Explorer", description: "Finish games across different genres.", unit: "genres",
    metric: (s) => s.genresFinished.size,
    steps: [{ tier: "bronze", target: 2 }, { tier: "silver", target: 3 }, { tier: "gold", target: 4 }, { tier: "platinum", target: 6 }],
  },
  {
    id: "productive_year", name: "Productive Year", description: "Finish games within a single year.", unit: "games",
    metric: (s) => maxYear(s),
    steps: [{ tier: "bronze", target: 5 }, { tier: "silver", target: 10 }, { tier: "gold", target: 20 }, { tier: "platinum", target: 40 }],
  },
  {
    id: "curator", name: "Curator", description: "Add games to the shared collection.", unit: "games",
    metric: (s) => s.gamesAdded,
    steps: [{ tier: "bronze", target: 10 }, { tier: "silver", target: 25 }, { tier: "gold", target: 100 }, { tier: "platinum", target: 250 }],
  },
];

// Total tiers across the whole catalog — for the ranking subtitle.
export const TOTAL_TIERS = ACHIEVEMENTS.reduce((n, d) => n + d.steps.length, 0);

export interface AchievementProgress {
  def: AchievementDef;
  current: number;             // the metric value
  stepsUnlocked: number;       // how many tiers reached (steps are ascending)
  currentTier: Tier | null;    // highest tier reached, or null if none
  nextStep: AchievementStep | null; // next tier to reach, null when maxed
  points: number;              // points earned so far from this achievement
  maxPoints: number;           // points if fully completed
  pctToNext: number;           // 0..100 progress toward the next tier (100 when maxed)
}

// Evaluate one achievement for a user. Steps are ascending, so the number of
// tiers reached is the count of targets <= current.
export function evaluateAchievement(def: AchievementDef, s: UserStats | undefined): AchievementProgress {
  const current = s ? def.metric(s) : 0;
  let stepsUnlocked = 0;
  for (const step of def.steps) { if (current >= step.target) stepsUnlocked++; else break; }
  const currentTier = stepsUnlocked > 0 ? def.steps[stepsUnlocked - 1].tier : null;
  const nextStep = stepsUnlocked < def.steps.length ? def.steps[stepsUnlocked] : null;
  const points = def.steps.slice(0, stepsUnlocked).reduce((sum, st) => sum + TIER_POINTS[st.tier], 0);
  const maxPoints = def.steps.reduce((sum, st) => sum + TIER_POINTS[st.tier], 0);
  const pctToNext = nextStep ? Math.min(100, (current / nextStep.target) * 100) : 100;
  return { def, current, stepsUnlocked, currentTier, nextStep, points, maxPoints, pctToNext };
}

// Total ranking points = sum of points earned across every stepped achievement.
export function totalPoints(s: UserStats | undefined): number {
  if (!s) return 0;
  return ACHIEVEMENTS.reduce((sum, def) => sum + evaluateAchievement(def, s).points, 0);
}

// Count of tiers a user has reached across all achievements.
export function tiersUnlocked(s: UserStats | undefined): number {
  if (!s) return 0;
  return ACHIEVEMENTS.reduce((n, def) => n + evaluateAchievement(def, s).stepsUnlocked, 0);
}

export interface RankRow {
  profile: Profile;
  points: number;
  tiers: number;  // unlocked tiers across all achievements
  rank: number;   // 1-based, shared on ties (1,1,3)
}

// Ranking over every profile (zero-point users included — it's a household
// race). Sorted by points desc; ties broken by name for deterministic order
// across realtime refreshes, and given the same shared rank.
export function computeRanking(statsByUser: Map<string, UserStats>, profiles: Profile[]): RankRow[] {
  const rows = profiles.map((profile) => {
    const s = statsByUser.get(profile.id);
    return { profile, points: totalPoints(s), tiers: tiersUnlocked(s), rank: 0 };
  });
  rows.sort((a, b) => b.points - a.points || a.profile.name.localeCompare(b.profile.name));
  let lastPoints = Number.POSITIVE_INFINITY;
  let lastRank = 0;
  rows.forEach((r, i) => {
    if (r.points < lastPoints) { lastRank = i + 1; lastPoints = r.points; }
    r.rank = lastRank;
  });
  return rows;
}

// ---- Challenges ------------------------------------------------------------

// Inclusive [start 00:00:00, end 23:59:59.999] window in epoch ms. Dates are
// 'YYYY-MM-DD'; we anchor to local time so the window matches how fmtDate and
// the date inputs read to the household.
const windowBounds = (c: Challenge) => ({
  startMs: new Date(`${c.period_start}T00:00:00`).getTime(),
  endMs: new Date(`${c.period_end}T23:59:59.999`).getTime(),
});

// Every completion event for (game, user): each archived run's finished_at, plus
// the live finished run's updated_at. A finished run is either live OR archived,
// never both (the replay flow moves it atomically), so this can't double-count.
function completionTimestamps(g: Game, uid: string): string[] {
  const ts = (g.playthroughs?.[uid] ?? []).map((r) => r.finished_at);
  const live = g.progress?.[uid];
  if (live?.status === "finished" && live.updated_at) ts.push(live.updated_at);
  return ts;
}

// How many games `uid` completed inside the challenge's window.
export function challengeCount(c: Challenge, uid: string, games: Game[]): number {
  const { startMs, endMs } = windowBounds(c);
  let n = 0;
  for (const g of games) {
    for (const iso of completionTimestamps(g, uid)) {
      const ms = new Date(iso).getTime();
      if (!Number.isNaN(ms) && ms >= startMs && ms <= endMs) n++;
    }
  }
  return n;
}

export interface ChallengeStanding {
  profile: Profile;
  count: number;
  pct: number;   // clamped 0..100
  done: boolean;
}

// Standings for a challenge across all profiles, leader first.
export function challengeStandings(c: Challenge, games: Game[], profiles: Profile[]): ChallengeStanding[] {
  return profiles
    .map((profile) => {
      const count = challengeCount(c, profile.id, games);
      return {
        profile,
        count,
        pct: c.target > 0 ? Math.min(100, (count / c.target) * 100) : 0,
        done: count >= c.target,
      };
    })
    .sort((a, b) => b.count - a.count || a.profile.name.localeCompare(b.profile.name));
}

// "upcoming" | "active" | "ended" relative to today (local). Used for the card hint.
export function challengePhase(c: Challenge, now: Date = new Date()): "upcoming" | "active" | "ended" {
  const today = now.getTime();
  const { startMs, endMs } = windowBounds(c);
  if (today < startMs) return "upcoming";
  if (today > endMs) return "ended";
  return "active";
}
