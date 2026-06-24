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

import type { AchievementUnlock, Challenge, Game, Profile } from "@/lib/types";

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
  // ---- Extended dimensions (added for the expanded catalog) ----------------
  valueAddedCents: number;      // total value of games this user added (cents)
  highValueAdded: number;       // games added worth €100+ each
  highRatedFinished: number;    // distinct finished games rated 80+ (0–100 scale)
  retroFinished: number;        // distinct finished games released ≤ 1999
  decadesFinished: Set<number>; // release decades of finished games (e.g. 1990)
  quickFinishes: number;        // finished in ≤ the game's HLTB main story hours
  longFinishes: number;         // finished games with 60+ logged hours
  maxGameHours: number;         // most hours sunk into a single game
  finishMonths: Set<string>;    // distinct "YYYY-MM" buckets a finish happened in
  abandonedCount: number;       // games this user marked abandoned
  developersFinished: Set<string>;
  genreFinishCounts: Record<string, number>;    // finishes per genre
  platformFinishCounts: Record<string, number>; // finishes per platform
  nightFinishes: number;        // finishes logged between midnight and 5am
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
  valueAddedCents: 0,
  highValueAdded: 0,
  highRatedFinished: 0,
  retroFinished: 0,
  decadesFinished: new Set<number>(),
  quickFinishes: 0,
  longFinishes: 0,
  maxGameHours: 0,
  finishMonths: new Set<string>(),
  abandonedCount: 0,
  developersFinished: new Set<string>(),
  genreFinishCounts: {},
  platformFinishCounts: {},
  nightFinishes: 0,
});

// Record one finish event at `iso` into the year / month / night buckets. (The
// updated_at-bumps caveat in the file header applies to these timestamps too.)
const bumpFinish = (s: UserStats, iso?: string | null) => {
  if (!iso) return;
  const d = new Date(iso);
  const y = d.getFullYear();
  if (Number.isNaN(y)) return;
  s.finishesByYear[y] = (s.finishesByYear[y] ?? 0) + 1;
  s.finishMonths.add(`${y}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  if (d.getHours() < 5) s.nightFinishes += 1;
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
    if (g.added_by) {
      const a = statsFor(g.added_by);
      a.gamesAdded += 1;
      a.valueAddedCents += g.value_cents || 0;
      if ((g.value_cents || 0) >= 10000) a.highValueAdded += 1; // €100+
    }

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

      // Hours: time invested in this one game (any status) across the live run +
      // archived runs. Feeds both the lifetime total and the per-game maximum.
      const gameHours = (live?.hours || 0) + runs.reduce((n, r) => n + (r.hours || 0), 0);
      s.totalHours += gameHours;
      if (gameHours > s.maxGameHours) s.maxGameHours = gameHours;
      if (live?.status === "abandoned") s.abandonedCount += 1;

      if (count === 0) continue;
      s.completions += count;
      s.distinctGamesFinished += 1;
      if (count >= 2) s.replayedGames += 1;
      s.maxReplays = Math.max(s.maxReplays, count);
      if (g.platform) { s.platformsFinished.add(g.platform); s.platformFinishCounts[g.platform] = (s.platformFinishCounts[g.platform] ?? 0) + 1; }
      if (g.genre) { s.genresFinished.add(g.genre); s.genreFinishCounts[g.genre] = (s.genreFinishCounts[g.genre] ?? 0) + 1; }
      if (g.developer) s.developersFinished.add(g.developer);
      if (g.rating && g.rating >= 80) s.highRatedFinished += 1;
      if (g.year) { if (g.year <= 1999) s.retroFinished += 1; s.decadesFinished.add(Math.floor(g.year / 10) * 10); }
      if (g.hltb?.main && gameHours > 0 && gameHours <= g.hltb.main) s.quickFinishes += 1;
      if (gameHours >= 60) s.longFinishes += 1;
      for (const r of runs) bumpFinish(s, r.finished_at);
      if (liveFinished) bumpFinish(s, live!.updated_at);
    }
  }
  return stats;
}

const maxYear = (s: UserStats) => {
  const vals = Object.values(s.finishesByYear);
  return vals.length ? Math.max(...vals) : 0;
};

// Largest value in a count map (e.g. most finishes in a single genre/platform).
const maxRecord = (r: Record<string, number>) => {
  const vals = Object.values(r);
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
  // lucide icon NAME (a string key) mapped to a component in the UI layer, so the
  // engine stays free of any UI/lucide import. Falls back to a default icon.
  icon?: string;
  // Secret achievement: the tile/detail sheet render "???" and suppress the
  // name/description/targets until the user has reached at least one tier.
  hidden?: boolean;
  metric: (s: UserStats) => number;
  steps: AchievementStep[]; // ascending by target
}

// The catalog: each entry is one achievement with four steps. Targets are tuned
// to the default 7 platforms / 6 genres and live here so balancing is one file.
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "completionist", name: "Completionist", description: "Finish games in your collection.", unit: "games", icon: "Trophy",
    metric: (s) => s.completions,
    steps: [{ tier: "bronze", target: 1 }, { tier: "silver", target: 10 }, { tier: "gold", target: 50 }, { tier: "platinum", target: 100 }],
  },
  {
    id: "time_served", name: "Time Served", description: "Log hours across your games.", unit: "h", icon: "Hourglass",
    metric: (s) => Math.floor(s.totalHours),
    steps: [{ tier: "bronze", target: 10 }, { tier: "silver", target: 100 }, { tier: "gold", target: 500 }, { tier: "platinum", target: 1000 }],
  },
  {
    id: "encore", name: "Encore", description: "Complete the same game more than once.", unit: "games", icon: "Repeat",
    metric: (s) => s.replayedGames,
    steps: [{ tier: "bronze", target: 1 }, { tier: "silver", target: 5 }, { tier: "gold", target: 15 }, { tier: "platinum", target: 30 }],
  },
  {
    id: "platform_hopper", name: "Platform Hopper", description: "Finish games on different systems.", unit: "systems", icon: "Gamepad2",
    metric: (s) => s.platformsFinished.size,
    steps: [{ tier: "bronze", target: 2 }, { tier: "silver", target: 3 }, { tier: "gold", target: 4 }, { tier: "platinum", target: 5 }],
  },
  {
    id: "genre_explorer", name: "Genre Explorer", description: "Finish games across different genres.", unit: "genres", icon: "Compass",
    metric: (s) => s.genresFinished.size,
    steps: [{ tier: "bronze", target: 2 }, { tier: "silver", target: 3 }, { tier: "gold", target: 4 }, { tier: "platinum", target: 6 }],
  },
  {
    id: "productive_year", name: "Productive Year", description: "Finish games within a single year.", unit: "games", icon: "CalendarCheck",
    metric: (s) => maxYear(s),
    steps: [{ tier: "bronze", target: 5 }, { tier: "silver", target: 10 }, { tier: "gold", target: 20 }, { tier: "platinum", target: 40 }],
  },
  {
    id: "curator", name: "Curator", description: "Add games to the shared collection.", unit: "games", icon: "Library",
    metric: (s) => s.gamesAdded,
    steps: [{ tier: "bronze", target: 10 }, { tier: "silver", target: 25 }, { tier: "gold", target: 100 }, { tier: "platinum", target: 250 }],
  },
  {
    id: "library_lord", name: "Library Lord", description: "Finish a wide range of distinct games.", unit: "games", icon: "LibraryBig",
    metric: (s) => s.distinctGamesFinished,
    steps: [{ tier: "bronze", target: 5 }, { tier: "silver", target: 25 }, { tier: "gold", target: 75 }, { tier: "platinum", target: 150 }],
  },
  {
    id: "marathoner", name: "Marathoner", description: "Replay a single game over and over.", unit: "runs", icon: "Flame",
    metric: (s) => s.maxReplays,
    steps: [{ tier: "bronze", target: 2 }, { tier: "silver", target: 3 }, { tier: "gold", target: 5 }, { tier: "platinum", target: 8 }],
  },
  {
    id: "renaissance_gamer", name: "Renaissance Gamer", description: "Spread finishes across both systems and genres.", unit: "breadth", icon: "Palette",
    metric: (s) => Math.min(s.platformsFinished.size, s.genresFinished.size),
    steps: [{ tier: "bronze", target: 2 }, { tier: "silver", target: 3 }, { tier: "gold", target: 4 }, { tier: "platinum", target: 5 }],
  },
  {
    id: "big_spender", name: "Big Spender", description: "Build up the collection's value with the games you add.", unit: "€", icon: "Wallet",
    metric: (s) => Math.floor(s.valueAddedCents / 100),
    steps: [{ tier: "bronze", target: 250 }, { tier: "silver", target: 1000 }, { tier: "gold", target: 5000 }, { tier: "platinum", target: 15000 }],
  },
  {
    id: "treasure_hunter", name: "Treasure Hunter", description: "Add high-value games (€100+) to the collection.", unit: "games", icon: "Gem",
    metric: (s) => s.highValueAdded,
    steps: [{ tier: "bronze", target: 1 }, { tier: "silver", target: 5 }, { tier: "gold", target: 15 }, { tier: "platinum", target: 40 }],
  },
  {
    id: "critic", name: "Critic", description: "Finish highly-rated games (80+ / four stars).", unit: "games", icon: "Star",
    metric: (s) => s.highRatedFinished,
    steps: [{ tier: "bronze", target: 1 }, { tier: "silver", target: 10 }, { tier: "gold", target: 30 }, { tier: "platinum", target: 75 }],
  },
  {
    id: "retro_revivalist", name: "Retro Revivalist", description: "Finish games released in 1999 or earlier.", unit: "games", icon: "Joystick",
    metric: (s) => s.retroFinished,
    steps: [{ tier: "bronze", target: 1 }, { tier: "silver", target: 5 }, { tier: "gold", target: 15 }, { tier: "platinum", target: 40 }],
  },
  {
    id: "time_traveler", name: "Time Traveler", description: "Finish games spanning different decades.", unit: "decades", icon: "History",
    metric: (s) => s.decadesFinished.size,
    steps: [{ tier: "bronze", target: 2 }, { tier: "silver", target: 3 }, { tier: "gold", target: 4 }, { tier: "platinum", target: 5 }],
  },
  {
    id: "speedrunner", name: "Speedrunner", description: "Finish games faster than their average main story.", unit: "games", icon: "Rabbit",
    metric: (s) => s.quickFinishes,
    steps: [{ tier: "bronze", target: 1 }, { tier: "silver", target: 5 }, { tier: "gold", target: 15 }, { tier: "platinum", target: 40 }],
  },
  {
    id: "long_hauler", name: "Long Hauler", description: "Finish games you poured 60+ hours into.", unit: "games", icon: "Mountain",
    metric: (s) => s.longFinishes,
    steps: [{ tier: "bronze", target: 1 }, { tier: "silver", target: 3 }, { tier: "gold", target: 8 }, { tier: "platinum", target: 20 }],
  },
  {
    id: "steady_hand", name: "Steady Hand", description: "Finish games across many different months.", unit: "months", icon: "CalendarRange",
    metric: (s) => s.finishMonths.size,
    steps: [{ tier: "bronze", target: 3 }, { tier: "silver", target: 6 }, { tier: "gold", target: 12 }, { tier: "platinum", target: 24 }],
  },
  {
    id: "genre_devotee", name: "Genre Devotee", description: "Finish a pile of games in a single genre.", unit: "games", icon: "Layers",
    metric: (s) => maxRecord(s.genreFinishCounts),
    steps: [{ tier: "bronze", target: 3 }, { tier: "silver", target: 10 }, { tier: "gold", target: 25 }, { tier: "platinum", target: 50 }],
  },
  {
    id: "console_loyalist", name: "Console Loyalist", description: "Finish a pile of games on a single system.", unit: "games", icon: "Tv",
    metric: (s) => maxRecord(s.platformFinishCounts),
    steps: [{ tier: "bronze", target: 3 }, { tier: "silver", target: 10 }, { tier: "gold", target: 25 }, { tier: "platinum", target: 50 }],
  },
  {
    id: "studio_tour", name: "Studio Tour", description: "Finish games from many different developers.", unit: "studios", icon: "Building2",
    metric: (s) => s.developersFinished.size,
    steps: [{ tier: "bronze", target: 3 }, { tier: "silver", target: 10 }, { tier: "gold", target: 25 }, { tier: "platinum", target: 60 }],
  },
  // ---- Hidden / secret achievements (rendered "???" until reached) ----------
  {
    id: "first_blood", name: "First Blood", description: "Finish your very first game.", unit: "games", icon: "Swords", hidden: true,
    metric: (s) => s.completions,
    steps: [{ tier: "bronze", target: 1 }],
  },
  {
    id: "deep_diver", name: "Deep Diver", description: "Sink an extraordinary number of hours into your games.", unit: "h", icon: "Anchor", hidden: true,
    metric: (s) => Math.floor(s.totalHours),
    steps: [{ tier: "bronze", target: 250 }, { tier: "silver", target: 750 }, { tier: "gold", target: 1500 }, { tier: "platinum", target: 3000 }],
  },
  {
    id: "night_owl", name: "Night Owl", description: "Finish games in the dead of night (midnight–5am).", unit: "games", icon: "Moon", hidden: true,
    metric: (s) => s.nightFinishes,
    steps: [{ tier: "bronze", target: 1 }, { tier: "silver", target: 5 }, { tier: "gold", target: 15 }],
  },
  {
    id: "obsessed", name: "Obsessed", description: "Pour an absurd number of hours into one single game.", unit: "h", icon: "Infinity", hidden: true,
    metric: (s) => Math.floor(s.maxGameHours),
    steps: [{ tier: "bronze", target: 50 }, { tier: "silver", target: 150 }, { tier: "gold", target: 300 }, { tier: "platinum", target: 600 }],
  },
  {
    id: "its_not_you", name: "It's Not You, It's Me", description: "Give up on games and walk away.", unit: "games", icon: "HeartCrack", hidden: true,
    metric: (s) => s.abandonedCount,
    steps: [{ tier: "bronze", target: 1 }, { tier: "silver", target: 5 }, { tier: "gold", target: 15 }],
  },
];

// Total tiers across the whole catalog — for the ranking subtitle.
export const TOTAL_TIERS = ACHIEVEMENTS.reduce((n, d) => n + d.steps.length, 0);

// ---- Categories ------------------------------------------------------------
// Achievements are grouped into a handful of themed categories so the grid can
// render collapsible sections (the full flat list is long). `icon` is a lucide
// name string, mapped to a component in the UI layer (engine stays UI-free).
export type AchievementCategory = "progress" | "mastery" | "exploration" | "collection" | "secret";

export const CATEGORY_META: { id: AchievementCategory; label: string; icon: string }[] = [
  { id: "progress", label: "Progress", icon: "TrendingUp" },
  { id: "mastery", label: "Mastery", icon: "Swords" },
  { id: "exploration", label: "Exploration", icon: "Compass" },
  { id: "collection", label: "Collection", icon: "Library" },
  { id: "secret", label: "Secret", icon: "Lock" },
];

// id → category. Kept as a map (rather than a field on every def) so the catalog
// entries stay terse. Unlisted ids fall back to secret-if-hidden, else progress.
const CATEGORY_OF: Record<string, AchievementCategory> = {
  completionist: "progress", time_served: "progress", library_lord: "progress", productive_year: "progress", steady_hand: "progress",
  encore: "mastery", marathoner: "mastery", speedrunner: "mastery", long_hauler: "mastery", genre_devotee: "mastery", console_loyalist: "mastery",
  platform_hopper: "exploration", genre_explorer: "exploration", renaissance_gamer: "exploration", time_traveler: "exploration", retro_revivalist: "exploration", studio_tour: "exploration",
  curator: "collection", big_spender: "collection", treasure_hunter: "collection", critic: "collection",
  first_blood: "secret", deep_diver: "secret", night_owl: "secret", obsessed: "secret", its_not_you: "secret",
};

export function categoryOf(def: AchievementDef): AchievementCategory {
  return CATEGORY_OF[def.id] ?? (def.hidden ? "secret" : "progress");
}

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

// The highest tier a user has reached across the whole catalog (for the hero
// chip). null if they've unlocked nothing yet.
export function highestTier(s: UserStats | undefined): Tier | null {
  let best: Tier | null = null;
  let bestIdx = -1;
  for (const def of ACHIEVEMENTS) {
    const t = evaluateAchievement(def, s).currentTier;
    if (!t) continue;
    const idx = TIER_ORDER.indexOf(t);
    if (idx > bestIdx) { bestIdx = idx; best = t; }
  }
  return best;
}

// ---- Unlock events (the bridge to celebration + persistence) ---------------

export interface UnlockEvent {
  achievementId: string;
  tier: Tier;
}

// Given before/after per-achievement step counts, return the tiers newly crossed.
// This is the single source of truth shared by the toast, the celebration, and
// the DB persistence — extracted from the loop that used to live inline in
// useAchievementToasts.
export function deriveUnlockEvents(
  before: Record<string, number>,
  after: Record<string, number>,
): UnlockEvent[] {
  const events: UnlockEvent[] = [];
  for (const def of ACHIEVEMENTS) {
    const b = before[def.id] ?? 0;
    const a = after[def.id] ?? 0;
    for (let i = b; i < a; i++) events.push({ achievementId: def.id, tier: def.steps[i].tier });
  }
  return events;
}

// ---- Filtering / sorting (achievement grid controls) -----------------------

export type AchievementFilter = "all" | "in_progress" | "almost" | "completed" | "locked";

export function matchesFilter(p: AchievementProgress, f: AchievementFilter): boolean {
  switch (f) {
    case "all": return true;
    case "in_progress": return p.stepsUnlocked > 0 && p.nextStep !== null;
    case "almost": return p.nextStep !== null && p.pctToNext >= 80;
    case "completed": return p.nextStep === null;
    case "locked": return p.stepsUnlocked === 0;
  }
}

export type AchievementSort = "progress" | "points" | "rarity";

// A def paired with its evaluated progress + household rarity — the row shape the
// grid renders and sorts.
export interface AchievementRow {
  def: AchievementDef;
  p: AchievementProgress;
  rarity: number; // 0..1, fraction of members who hold ≥1 tier (0 = rarest)
}

export function sortAchievements(rows: AchievementRow[], sort: AchievementSort): AchievementRow[] {
  const copy = [...rows];
  switch (sort) {
    case "progress": copy.sort((a, b) => b.p.pctToNext - a.p.pctToNext || b.p.stepsUnlocked - a.p.stepsUnlocked); break;
    case "points": copy.sort((a, b) => b.p.points - a.p.points || b.p.maxPoints - a.p.maxPoints); break;
    case "rarity": copy.sort((a, b) => a.rarity - b.rarity || b.p.points - a.p.points); break;
  }
  return copy;
}

// "X more <unit> to <tier>" source — null when maxed.
export function remainingToNext(p: AchievementProgress): { remaining: number; tier: Tier } | null {
  if (!p.nextStep) return null;
  return { remaining: Math.max(0, p.nextStep.target - p.current), tier: p.nextStep.tier };
}

// ---- Household coverage / rarity (computed live across all members) ---------

// How many of `profiles` have reached a given tier on this achievement.
export function tierCoverage(
  def: AchievementDef, tier: Tier, statsByUser: Map<string, UserStats>, profiles: Profile[],
): { holders: number; total: number } {
  const tierIdx = def.steps.findIndex((s) => s.tier === tier);
  let holders = 0;
  if (tierIdx >= 0) {
    for (const prof of profiles) {
      if (evaluateAchievement(def, statsByUser.get(prof.id)).stepsUnlocked > tierIdx) holders++;
    }
  }
  return { holders, total: profiles.length };
}

// Fraction of members who hold at least one tier of this achievement (0 = nobody
// = rarest). Drives the rarity sort and a "rare" hint in the UI.
export function rarityScore(
  def: AchievementDef, statsByUser: Map<string, UserStats>, profiles: Profile[],
): number {
  if (profiles.length === 0) return 1;
  let holders = 0;
  for (const prof of profiles) {
    if (evaluateAchievement(def, statsByUser.get(prof.id)).stepsUnlocked > 0) holders++;
  }
  return holders / profiles.length;
}

// ---- Stored unlock timestamps ----------------------------------------------

// The stored unlock moment for (profile, achievement, tier), or null when there
// is no recorded row (e.g. tiers earned before the history feature existed —
// those are shown as "—" rather than a misleading backfilled date).
export function unlockedAtFor(
  unlocks: AchievementUnlock[], profileId: string, achievementId: string, tier: Tier,
): string | null {
  const hit = unlocks.find(
    (u) => u.profile_id === profileId && u.achievement_id === achievementId && u.tier === tier,
  );
  return hit?.unlocked_at ?? null;
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
