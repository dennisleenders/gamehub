// The selectable avatar set. Profiles store an avatar `id` (e.g. "cat" or a
// generated "lore-*" id); the UI resolves it to an image via avatarSrc(). The
// ids are stable, so existing profiles keep their choice even as the set grows.

export interface AvatarOption {
  id: string;
  src: string;
}

// Fixed choices shown as tiles in the picker grid.
export const AVATARS: AvatarOption[] = [
  { id: "raccoon", src: "/avatars/raccoon.svg" },
  { id: "dog", src: "/avatars/dog.svg" },
  { id: "cat", src: "/avatars/cat.svg" },
  { id: "mouse", src: "/avatars/mouse.svg" },
];

// Gaming-lore avatars. These are NOT shown as fixed tiles — they're surfaced
// only through the "surprise me" button, which assigns a random one.
export const LORE_AVATARS: AvatarOption[] = [
  { id: "lore-slime", src: "/avatars/lore-slime.svg" },
  { id: "lore-mushroom", src: "/avatars/lore-mushroom.svg" },
  { id: "lore-ghost", src: "/avatars/lore-ghost.svg" },
  { id: "lore-invader", src: "/avatars/lore-invader.svg" },
  { id: "lore-heart", src: "/avatars/lore-heart.svg" },
  { id: "lore-sword", src: "/avatars/lore-sword.svg" },
  { id: "lore-potion", src: "/avatars/lore-potion.svg" },
  { id: "lore-skull", src: "/avatars/lore-skull.svg" },
  { id: "lore-coin", src: "/avatars/lore-coin.svg" },
  { id: "lore-gem", src: "/avatars/lore-gem.svg" },
  { id: "lore-gamepad", src: "/avatars/lore-gamepad.svg" },
  { id: "lore-bolt", src: "/avatars/lore-bolt.svg" },
];

// Retired avatars, kept only so profiles that already stored one still resolve
// to an image (they're no longer offered as new choices).
const LEGACY_AVATARS: AvatarOption[] = [
  { id: "a1", src: "/avatars/avatar-1.svg" },
  { id: "a2", src: "/avatars/avatar-2.svg" },
  { id: "a3", src: "/avatars/avatar-3.svg" },
  { id: "a4", src: "/avatars/avatar-4.svg" },
  { id: "a5", src: "/avatars/avatar-5.svg" },
];

const ALL_AVATARS = [...AVATARS, ...LORE_AVATARS, ...LEGACY_AVATARS];

// Resolve a stored avatar id to its image URL. Returns null for unknown/empty
// ids so callers can fall back to the initial-letter avatar.
export const avatarSrc = (id?: string | null): string | null =>
  ALL_AVATARS.find((a) => a.id === id)?.src ?? null;

const LORE_IDS = new Set(LORE_AVATARS.map((a) => a.id));

// Is this a generated gaming-lore avatar (vs. one of the fixed grid tiles)?
export const isLoreAvatar = (id?: string | null): boolean => !!id && LORE_IDS.has(id);

// Pick a random gaming-lore avatar id, skipping any in `exclude` (e.g. ones
// already taken by other household members, or the current pick so a re-roll
// always changes). Falls back to the whole pool if everything is excluded.
export function randomLoreAvatar(exclude?: Iterable<string>): string {
  const taken = new Set(exclude ?? []);
  const free = LORE_AVATARS.filter((a) => !taken.has(a.id));
  const pool = free.length ? free : LORE_AVATARS;
  return pool[Math.floor(Math.random() * pool.length)].id;
}
