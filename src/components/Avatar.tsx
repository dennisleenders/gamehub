"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import type { Profile } from "@/lib/types";
import { PROFILE_COLORS } from "@/lib/types";
import { AVATARS, avatarSrc } from "@/lib/avatars";

type AvatarUser = Pick<Profile, "name" | "color" | "avatar">;

// The household avatar. Shows the chosen avatar image; falls back to the
// initial-letter badge when no avatar is set (or the image fails to load). The
// member's colour is a 2px ring around it.
export function Avatar({ user, size = 22 }: { user: AvatarUser; size?: number }) {
  const src = avatarSrc(user.avatar);
  const [err, setErr] = useState(false);
  const border = `2px solid ${user.color}`;
  if (src && !err) {
    return (
      <img src={src} alt={user.name} onError={() => setErr(true)}
        style={{ width: size, height: size, borderRadius: 99, objectFit: "cover", border, flexShrink: 0, display: "block", background: "var(--panel)" }} />
    );
  }
  return (
    <span style={{ display: "inline-grid", placeItems: "center", width: size, height: size, borderRadius: 99, background: user.color + "30", border, color: "var(--ink)", fontFamily: "var(--display)", fontWeight: 700, fontSize: size * 0.42, flexShrink: 0 }}>
      {user.name[0].toUpperCase()}
    </span>
  );
}

// A grid of selectable avatar images. `color` tints the selected ring + check.
// Reused by registration and the logged-in picker. `disabledIds` are avatars
// already claimed by other household members — shown dimmed and unselectable.
export function AvatarGrid({ value, color, onSelect, disabledIds }: { value?: string | null; color: string; onSelect: (id: string) => void; disabledIds?: Set<string> }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      {AVATARS.map((a) => {
        const on = a.id === value;
        // Never disable the user's own current pick, only ones others have taken.
        const taken = !on && !!disabledIds?.has(a.id);
        return (
          <button key={a.id} type="button" onClick={() => !taken && onSelect(a.id)} disabled={taken}
            aria-label={taken ? `Avatar ${a.id} (taken)` : `Avatar ${a.id}`}
            style={{ position: "relative", width: 62, height: 62, padding: 0, borderRadius: 99, cursor: taken ? "not-allowed" : "pointer", border: "none", background: "none", lineHeight: 0, opacity: taken ? 0.32 : 1 }}>
            {/* Border lives on the image (single element) so there's no seam ring. */}
            <img src={a.src} alt="" style={{ width: "100%", height: "100%", borderRadius: 99, objectFit: "cover", display: "block", border: `2px solid ${on ? color : "var(--line)"}` }} />
            {on && (
              <span style={{ position: "absolute", bottom: -3, right: -3, display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 99, background: color, border: "2px solid var(--panel)" }}>
                <Check size={12} strokeWidth={3} color="var(--bg)" />
              </span>
            )}
            {taken && (
              <span style={{ position: "absolute", bottom: -3, right: -3, display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 99, background: "var(--line)", border: "2px solid var(--panel)" }}>
                <X size={12} strokeWidth={3} color="var(--ink-dim)" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Logged-in avatar chooser — a bottom sheet opened from the profile menu.
// `others` are the rest of the household; their avatar/colour are off-limits so
// no two members in a vault share the same pairing.
export function AvatarPickerModal({ currentUser, others = [], onClose, onSave }: {
  currentUser: Profile;
  others?: Pick<Profile, "avatar" | "color">[];
  onClose: () => void;
  onSave: (fields: { avatar: string; color: string }) => Promise<void> | void;
}) {
  const [avatar, setAvatar] = useState<string | null>(currentUser.avatar ?? null);
  const [color, setColor] = useState<string>(currentUser.color);
  const [saving, setSaving] = useState(false);
  // Avatars/colours claimed by other members. The user's own current pick is
  // never blocked, so a pre-existing clash can still be kept (or changed).
  const takenAvatars = new Set(others.map((o) => o.avatar).filter(Boolean) as string[]);
  const takenColors = new Set(others.map((o) => o.color));
  // Safety net behind the disabled options: never persist a pairing that
  // collides with another member's avatar or colour.
  const clash = (!!avatar && avatar !== currentUser.avatar && takenAvatars.has(avatar))
    || (color !== currentUser.color && takenColors.has(color));
  const dirty = !!avatar && !clash && (avatar !== currentUser.avatar || color !== currentUser.color);

  const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, marginBottom: 10, display: "block" };

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try { await onSave({ avatar: avatar!, color }); onClose(); } finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }} className="sheet-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, maxHeight: "calc(94vh - env(safe-area-inset-top))", overflowY: "auto", background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "20px 20px calc(20px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 16, color: "var(--accent)" }}>AVATAR &amp; COLOUR</div>
          <button onClick={onClose} style={{ display: "grid", placeItems: "center", width: 32, height: 32, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink)", padding: 0 }}><X size={16} /></button>
        </div>

        <label style={lbl}>AVATAR</label>
        {/* Selected ring uses the live colour choice so it previews the pairing. */}
        <AvatarGrid value={avatar} color={color} onSelect={setAvatar} disabledIds={takenAvatars} />

        <label style={{ ...lbl, marginTop: 20 }}>COLOUR</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {PROFILE_COLORS.map((c) => {
            const on = color === c;
            // A colour another member uses is locked — but keep the user's own
            // current colour selectable so they can leave it unchanged.
            const taken = !on && c !== currentUser.color && takenColors.has(c);
            return (
              <button key={c} type="button" onClick={() => !taken && setColor(c)} disabled={taken} aria-label={taken ? "colour (taken)" : "colour"}
                style={{ position: "relative", width: 32, height: 32, borderRadius: 99, background: c, cursor: taken ? "not-allowed" : "pointer",
                  opacity: taken ? 0.32 : 1, border: on ? "3px solid var(--ink)" : "3px solid transparent" }}>
                {taken && <X size={14} strokeWidth={3} color="var(--ink)" style={{ position: "absolute", inset: 0, margin: "auto" }} />}
              </button>
            );
          })}
        </div>

        <button onClick={save} disabled={!dirty || saving}
          style={{ width: "100%", marginTop: 22, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 0", border: "none", borderRadius: "var(--radius)", cursor: dirty && !saving ? "pointer" : "not-allowed", background: "var(--accent2)", color: "var(--bg)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 14, opacity: dirty && !saving ? 1 : 0.5 }}>
          <Check size={17} strokeWidth={3} /> SAVE
        </button>
      </div>
    </div>
  );
}
