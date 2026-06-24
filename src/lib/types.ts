// Shared domain types + UI constants for GameVault.

// "collection" is the neutral default: the game is simply in the vault, with no
// stated intent to play it. "backlog" is the opt-in "I want to play this someday"
// list. The two are distinct so, in a shared household, a member can hold a game
// neutrally while someone else has it backlogged or is playing it.
export type PlayStatus = "collection" | "backlog" | "playing" | "finished" | "abandoned";

// ---- HOUSEHOLDS (vaults) ---------------------------------------------------
// A household is a self-contained vault. Each user belongs to exactly one. The
// owner (its creator) can rename it, manage members, regenerate the invite code
// and delete it; members can edit the shared collection.
export type HouseholdRole = "owner" | "member";

export interface Household {
  id: string;
  name: string;
  invite_code: string;
  created_by?: string | null;
  created_at?: string;
}

export interface HouseholdMember {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  joined_at?: string;
}

// A membership joined to its profile for the member-management UI.
export interface MemberWithProfile extends HouseholdMember {
  profile?: Profile;
}

export interface Profile {
  id: string;
  name: string;
  color: string;
  // Chosen avatar id (see lib/avatars). Null/absent → initial-letter fallback.
  avatar?: string | null;
  // Per-user personal settings (not shared with the household). `overview` maps
  // a section key to its visibility; a section shows unless explicitly false.
  preferences?: { overview?: Record<string, boolean> };
}

// The overview sections each user can show/hide. The hero and "Your Collection"
// stats are fixed and intentionally absent. Drives both the Settings toggles and
// the render gating in VaultApp.
export const OVERVIEW_SECTIONS = [
  { key: "ranking", label: "Ranking" },
  { key: "recently_added", label: "Recently Added" },
  { key: "recently_played", label: "Recently Played" },
  { key: "upcoming", label: "Upcoming Games" },
  { key: "events", label: "Game Events" },
  { key: "most_valued", label: "Most Valued" },
  { key: "by_system", label: "By System" },
  { key: "collection_value", label: "Estimated Value" },
] as const;

// An unreleased game from IGDB, surfaced in the Upcoming view + dashboard rail.
// Not stored in our DB — fetched live via /api/upcoming. `releaseDate` is the
// IGDB `first_release_date` in unix seconds (earliest across platforms).
export interface UpcomingGame {
  igdbId: number;
  title: string;
  cover: string;        // box-art URL, or "" when absent
  releaseDate: number;  // unix seconds
  platforms: string[];  // abbreviations, e.g. ["PS5", "PC"]
  genre: string;
  hype: number;         // IGDB pre-release follow count
  maxPlayers: number;   // highest player count across multiplayer modes (0 = unknown/single-player)
  mpTypes: string[];    // multiplayer kinds offered: "online" | "couch" | "split" | "lan"
}

// A games-industry showcase/conference from IGDB's /v4/events endpoint (Summer
// Game Fest, Nintendo Direct, State of Play, gamescom, …). Surfaced in the
// Upcoming view's Events section. Not stored in our DB — fetched live via
// /api/events. Times are unix seconds; the client splits events into
// upcoming / live now / passed by comparing them against the current time.
export interface GameEvent {
  id: number;
  name: string;
  description: string;
  startTime: number | null; // unix seconds (null only if IGDB has no time)
  endTime: number | null;   // unix seconds, or null when IGDB omits it
  liveStreamUrl: string;    // official stream URL, or "" when absent
  logo: string;             // event logo image URL, or "" when absent
}

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

// A shared, household-wide challenge (a "race"). Currently the only kind is
// "complete N games within a date window"; `type` stays a union so the create
// form's picker and the client-side progress switch remain exhaustive. Only the
// definition is stored — each user's progress is computed live from completions.
export type ChallengeType = "complete_games";

export interface Challenge {
  id: string;
  title: string;
  type: ChallengeType;
  target: number;
  period_start: string; // 'YYYY-MM-DD'
  period_end: string;   // 'YYYY-MM-DD'
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

// A persisted achievement-tier unlock. Achievements themselves are computed live
// (see lib/achievements.ts); only the unlock MOMENT is stored, because live data
// can't reconstruct an accurate per-tier timestamp. Append-only — rows are never
// auto-deleted, so the history/timeline stays truthful even if live progress
// later regresses. The tier union is inlined (not imported from achievements.ts)
// to avoid a types ↔ achievements import cycle.
export interface AchievementUnlock {
  id: string;
  profile_id: string;
  achievement_id: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  unlocked_at: string;
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
  // IGDB's systems for this game, mapped to our PLATFORMS — cached so the edit
  // form can narrow the platform dropdown without re-calling IGDB. Empty = unknown.
  platforms?: string[];
  hltb?: { main: number | null; extra: number | null; complete: number | null } | null;
  igdb_id?: number | null;
  pricecharting_id?: string | null;
  added_by?: string | null;
  created_at?: string;
  // Joined client-side: { [userId]: { status, hours, updated_at } } — the current run.
  progress?: Record<string, { status: PlayStatus; hours: number; updated_at?: string }>;
  // Joined client-side: { [userId]: Playthrough[] } — archived completed runs, oldest→newest.
  playthroughs?: Record<string, Playthrough[]>;
}

// The colour palette a member picks from — used everywhere their colour tints
// the UI (avatar ring, badges, progress bars). Shared by registration + the
// logged-in profile picker.
export const PROFILE_COLORS = ["#6fc7b3", "#e0738a", "#e6b667", "#7fb2ff", "#c98cff", "#7fd98a"];

// The fixed, app-wide list of platforms. This is the single source for every
// platform selector/filter — it is intentionally NOT user-editable. To add or
// rename a system, edit this list. (PS1–PS5/DS/3DS keep their original labels so
// existing games stay matched.)
export const PLATFORMS = [
  // PlayStation
  "PS1", "PS2", "PS3", "PS4", "PS5", "PSP", "PS Vita",
  // Nintendo — home
  "NES", "SNES", "N64", "GameCube", "Wii", "Wii U", "Switch", "Switch 2",
  // Nintendo — handheld
  "Game Boy", "Game Boy Color", "Game Boy Advance", "DS", "3DS",
  // Xbox
  "Xbox", "Xbox 360", "Xbox One", "Xbox Series",
  // Sega
  "Master System", "Mega Drive", "Saturn", "Dreamcast", "Game Gear",
  // Other
  "PC", "Atari 2600", "Neo Geo", "TurboGrafx-16",
];

// IGDB platform abbreviations/names → our curated PLATFORMS values. The lookup
// normalises both sides (lowercased, non-alphanumerics stripped) so "PS Vita"/
// "Vita", "Xbox Series X|S"/"XSX", "Sega Mega Drive/Genesis"/"Genesis" all resolve.
// Anything unmapped is simply dropped — callers then fall back to the full list
// rather than showing an empty dropdown, so a missing entry never blocks a save.
const IGDB_PLATFORM_ALIASES: Record<string, string> = {
  ps1: "PS1", playstation: "PS1",
  ps2: "PS2", playstation2: "PS2",
  ps3: "PS3", playstation3: "PS3",
  ps4: "PS4", playstation4: "PS4",
  ps5: "PS5", playstation5: "PS5",
  psp: "PSP", playstationportable: "PSP",
  vita: "PS Vita", psvita: "PS Vita", playstationvita: "PS Vita",
  nes: "NES", famicom: "NES", familycomputer: "NES", nintendoentertainmentsystem: "NES",
  snes: "SNES", sfam: "SNES", superfamicom: "SNES", supernintendoentertainmentsystem: "SNES",
  n64: "N64", nintendo64: "N64",
  ngc: "GameCube", gc: "GameCube", gamecube: "GameCube", nintendogamecube: "GameCube",
  wii: "Wii",
  wiiu: "Wii U",
  switch: "Switch", nintendoswitch: "Switch",
  switch2: "Switch 2", nintendoswitch2: "Switch 2",
  gb: "Game Boy", gameboy: "Game Boy",
  gbc: "Game Boy Color", gameboycolor: "Game Boy Color",
  gba: "Game Boy Advance", gameboyadvance: "Game Boy Advance",
  nds: "DS", ds: "DS", nintendods: "DS",
  "3ds": "3DS", nintendo3ds: "3DS", new3ds: "3DS",
  xbox: "Xbox",
  x360: "Xbox 360", xbox360: "Xbox 360",
  xone: "Xbox One", xboxone: "Xbox One",
  seriesx: "Xbox Series", xsx: "Xbox Series", seriesxs: "Xbox Series", xboxseries: "Xbox Series", xboxseriesxs: "Xbox Series", xboxseriesx: "Xbox Series", xboxseriess: "Xbox Series",
  sms: "Master System", mastersystem: "Master System", segamastersystem: "Master System",
  genesis: "Mega Drive", megadrive: "Mega Drive", segamegadrive: "Mega Drive", segagenesis: "Mega Drive", segamegadrivegenesis: "Mega Drive",
  saturn: "Saturn", segasaturn: "Saturn",
  dc: "Dreamcast", dreamcast: "Dreamcast", segadreamcast: "Dreamcast",
  gg: "Game Gear", gamegear: "Game Gear", segagamegear: "Game Gear",
  pc: "PC", win: "PC", windows: "PC", microsoftwindows: "PC", pcmicrosoftwindows: "PC", dos: "PC",
  atari2600: "Atari 2600", "2600": "Atari 2600",
  neogeo: "Neo Geo", neogeoaes: "Neo Geo", neogeomvs: "Neo Geo", neogeocd: "Neo Geo",
  tg16: "TurboGrafx-16", turbografx16: "TurboGrafx-16", pcengine: "TurboGrafx-16", turbografx16pcengine: "TurboGrafx-16",
};

// Map a list of IGDB platform strings to our PLATFORMS values, de-duped and in
// order. Unrecognised platforms are dropped (see IGDB_PLATFORM_ALIASES).
export function igdbPlatformsToApp(list: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of list ?? []) {
    const mapped = IGDB_PLATFORM_ALIASES[String(raw).toLowerCase().replace(/[^a-z0-9]/g, "")];
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

export const CONDITIONS = ["Sealed", "CIB", "Loose"];
export const REGIONS = ["PAL", "NTSC-U", "NTSC-J"];
export const DEFAULT_GENRES = ["RPG", "Action", "Platformer", "Horror", "Strategy", "Adventure"];

export const PLAY_STATUS: Record<PlayStatus, { label: string; short: string }> = {
  collection: { label: "In Collection", short: "COLLECTION" },
  backlog: { label: "Backlog", short: "BACKLOG" },
  playing: { label: "Playing", short: "PLAYING" },
  finished: { label: "Finished", short: "FINISHED" },
  abandoned: { label: "Abandoned", short: "ABANDONED" },
};

export const PLATFORM_TINT: Record<string, string> = {
  PS1: "#8b9bff", PS2: "#5a78ff", PS3: "#3aa0ff", PS4: "#2186e8", PS5: "#dfe7fb",
  DS: "#ff5a8a", "3DS": "#ff9f43",
};

export const money = (cents?: number | null) =>
  "€" + Math.round((cents ?? 0) / 100).toLocaleString("nl-NL");

export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
