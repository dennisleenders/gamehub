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
// Reused by registration and the logged-in picker.
export function AvatarGrid({ value, color, onSelect }: { value?: string | null; color: string; onSelect: (id: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      {AVATARS.map((a) => {
        const on = a.id === value;
        return (
          <button key={a.id} type="button" onClick={() => onSelect(a.id)} aria-label={`Avatar ${a.id}`}
            style={{ position: "relative", width: 62, height: 62, padding: 0, borderRadius: 99, cursor: "pointer", border: "none", background: "none", lineHeight: 0 }}>
            {/* Border lives on the image (single element) so there's no seam ring. */}
            <img src={a.src} alt="" style={{ width: "100%", height: "100%", borderRadius: 99, objectFit: "cover", display: "block", border: `2px solid ${on ? color : "var(--line)"}` }} />
            {on && (
              <span style={{ position: "absolute", bottom: -3, right: -3, display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 99, background: color, border: "2px solid var(--panel)" }}>
                <Check size={12} strokeWidth={3} color="var(--bg)" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Logged-in avatar chooser — a bottom sheet opened from the profile menu.
export function AvatarPickerModal({ currentUser, onClose, onSave }: {
  currentUser: Profile;
  onClose: () => void;
  onSave: (fields: { avatar: string; color: string }) => Promise<void> | void;
}) {
  const [avatar, setAvatar] = useState<string | null>(currentUser.avatar ?? null);
  const [color, setColor] = useState<string>(currentUser.color);
  const [saving, setSaving] = useState(false);
  const dirty = !!avatar && (avatar !== currentUser.avatar || color !== currentUser.color);

  const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, marginBottom: 10, display: "block" };

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try { await onSave({ avatar: avatar!, color }); onClose(); } finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }} className="fade">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, maxHeight: "calc(94vh - env(safe-area-inset-top))", overflowY: "auto", background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "20px 20px calc(20px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 16, color: "var(--accent)" }}>AVATAR &amp; COLOUR</div>
          <button onClick={onClose} style={{ display: "grid", placeItems: "center", width: 32, height: 32, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink)", padding: 0 }}><X size={16} /></button>
        </div>

        <label style={lbl}>AVATAR</label>
        {/* Selected ring uses the live colour choice so it previews the pairing. */}
        <AvatarGrid value={avatar} color={color} onSelect={setAvatar} />

        <label style={{ ...lbl, marginTop: 20 }}>COLOUR</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {PROFILE_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label="colour"
              style={{ width: 32, height: 32, borderRadius: 99, background: c, cursor: "pointer",
                border: color === c ? "3px solid var(--ink)" : "3px solid transparent" }} />
          ))}
        </div>

        <button onClick={save} disabled={!dirty || saving}
          style={{ width: "100%", marginTop: 22, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 0", border: "none", borderRadius: "var(--radius)", cursor: dirty && !saving ? "pointer" : "not-allowed", background: "var(--accent2)", color: "var(--bg)", fontFamily: "var(--display)", fontWeight: 700, fontSize: 14, opacity: dirty && !saving ? 1 : 0.5 }}>
          <Check size={17} strokeWidth={3} /> SAVE
        </button>
      </div>
    </div>
  );
}
