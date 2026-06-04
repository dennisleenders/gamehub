// The selectable avatar set. Profiles store an avatar `id` (e.g. "a1"); the UI
// resolves it to an image via avatarSrc(). To swap in real artwork later, just
// replace the files in /public/avatars (or repoint `src` here) — the ids stay
// stable so existing profiles keep their choice. Add more entries to grow the set.

export interface AvatarOption {
  id: string;
  src: string;
}

export const AVATARS: AvatarOption[] = [
  { id: "a1", src: "/avatars/avatar-1.svg" },
  { id: "a2", src: "/avatars/avatar-2.svg" },
  { id: "a3", src: "/avatars/avatar-3.svg" },
  { id: "a4", src: "/avatars/avatar-4.svg" },
  { id: "a5", src: "/avatars/avatar-5.svg" },
];

// Resolve a stored avatar id to its image URL. Returns null for unknown/empty
// ids so callers can fall back to the initial-letter avatar.
export const avatarSrc = (id?: string | null): string | null =>
  AVATARS.find((a) => a.id === id)?.src ?? null;
