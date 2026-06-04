// Shared domain types + UI constants for GameVault.

export type PlayStatus = "backlog" | "playing" | "finished";

export interface Profile {
  id: string;
  name: string;
  color: string;
  // Per-user personal settings (not shared with the household). `overview` maps
  // a section key to its visibility; a section shows unless explicitly false.
  preferences?: { overview?: Record<string, boolean> };
}

// The overview sections each user can show/hide. The hero and "Your Collection"
// stats are fixed and intentionally absent. Drives both the Settings toggles and
// the render gating in VaultApp.
export const OVERVIEW_SECTIONS = [
  { key: "recently_added", label: "Recently Added" },
  { key: "recently_played", label: "Recently Played" },
  { key: "most_valued", label: "Most Valued" },
  { key: "by_system", label: "By System" },
  { key: "collection_value", label: "Estimated Value" },
] as const;

export interface ProgressRow {
  game_id: string;
  user_id: string;
  status: PlayStatus;
  hours: number;
}

// An archived, completed run of a game by a user. The live `progress` row holds
// the current run; finished runs are copied here when a replay starts.
export interface Playthrough {
  id: string;
  game_id: string;
  user_id: string;
  hours: number;
  finished_at: string;
}

export interface Game {
  id: string;
  title: string;
  platform: string;
  status: "owned" | "wishlist";
  condition?: string | null;
  region?: string | null;
  genre?: string | null;
  year?: number | null;
  developer?: string | null;
  publisher?: string | null;
  rating?: number | null;
  value_cents?: number | null;
  cover?: string | null;
  description?: string | null;
  screenshots?: string[];
  hltb?: { main: number | null; extra: number | null; complete: number | null } | null;
  notes?: string | null;
  igdb_id?: number | null;
  pricecharting_id?: string | null;
  added_by?: string | null;
  created_at?: string;
  // Joined client-side: { [userId]: { status, hours, updated_at } } — the current run.
  progress?: Record<string, { status: PlayStatus; hours: number; updated_at?: string }>;
  // Joined client-side: { [userId]: Playthrough[] } — archived completed runs, oldest→newest.
  playthroughs?: Record<string, Playthrough[]>;
}

export const DEFAULT_PLATFORMS = ["PS1", "PS2", "PS3", "PS4", "PS5", "DS", "3DS"];
export const CONDITIONS = ["Sealed", "CIB", "Loose"];
export const REGIONS = ["PAL", "NTSC-U", "NTSC-J"];
export const DEFAULT_GENRES = ["RPG", "Action", "Platformer", "Horror", "Strategy", "Adventure"];

export const PLAY_STATUS: Record<PlayStatus, { label: string; short: string }> = {
  backlog: { label: "Backlog", short: "BACKLOG" },
  playing: { label: "Playing", short: "PLAYING" },
  finished: { label: "Finished", short: "FINISHED" },
};

export const PLATFORM_TINT: Record<string, string> = {
  PS1: "#8b9bff", PS2: "#5a78ff", PS3: "#3aa0ff", PS4: "#2186e8", PS5: "#dfe7fb",
  DS: "#ff5a8a", "3DS": "#ff9f43",
};

export const money = (cents?: number | null) =>
  "€" + Math.round((cents ?? 0) / 100).toLocaleString("nl-NL");

export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
