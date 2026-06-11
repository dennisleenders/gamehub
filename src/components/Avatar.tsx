"use client";

import { useState } from "react";
import { Check, X, Dices } from "lucide-react";
import type { Profile } from "@/lib/types";
import { PROFILE_COLORS } from "@/lib/types";
import { AVATARS, avatarSrc, isLoreAvatar, randomLoreAvatar } from "@/lib/avatars";

type AvatarUser = Pick<Profile, "name" | "color" | "avatar">;

// The household avatar: the member's chosen colour fills the circle and the
// chosen icon sits on top. The icon SVGs are transparent (white glyph with
// cut-out details), so the colour shows through — no border/ring. Falls back to
// the initial letter on the same colour fill when no icon is set.
export function Avatar({ user, size = 22 }: { user: AvatarUser; size?: number }) {
  const src = avatarSrc(user.avatar);
  if (src) {
    return (
      <div role="img" aria-label={user.name}
        style={{ width: size, height: size, borderRadius: 99, flexShrink: 0, backgroundColor: user.color,
          backgroundImage: `url("${src}")`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }} />
    );
  }
  return (
    <span style={{ display: "inline-grid", placeItems: "center", width: size, height: size, borderRadius: 99, background: user.color, color: "#fff", fontFamily: "var(--display)", fontWeight: 700, fontSize: size * 0.42, flexShrink: 0 }}>
      {user.name[0].toUpperCase()}
    </span>
  );
}

// A grid of selectable icons. Each tile previews the icon over the chosen
// `color` — exactly how the avatar will look — so the grid doubles as a live
// preview. Selection is shown by an outline ring + check (no border on the
// avatar itself). When `onGenerate` is given, a dice tile is appended that rolls
// a random gaming-lore icon; once one is picked it previews in that tile.
export function AvatarGrid({ value, color, onSelect, onGenerate }: { value?: string | null; color: string; onSelect: (id: string) => void; onGenerate?: () => void }) {
  const loreOn = isLoreAvatar(value);
  // The avatar disc: chosen colour fill + transparent icon on top.
  const disc = (src: string, on: boolean): React.CSSProperties => ({
    width: "100%", height: "100%", borderRadius: 99, backgroundColor: color,
    backgroundImage: `url("${src}")`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat",
    boxShadow: on ? "0 0 0 3px var(--ink)" : "none",
  });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
      {AVATARS.map((a) => {
        const on = a.id === value;
        return (
          <button key={a.id} type="button" onClick={() => onSelect(a.id)} aria-label={`Avatar ${a.id}`}
            style={{ position: "relative", width: 62, height: 62, padding: 0, borderRadius: 99, cursor: "pointer", border: "none", background: "none", lineHeight: 0 }}>
            <div aria-hidden style={disc(a.src, on)} />
            {on && (
              <span style={{ position: "absolute", bottom: -3, right: -3, display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 99, background: "var(--ink)", border: "2px solid var(--panel)" }}>
                <Check size={12} strokeWidth={3} color="var(--bg)" />
              </span>
            )}
          </button>
        );
      })}
      {onGenerate && (
        <button type="button" onClick={onGenerate} aria-label="Surprise me with a random gaming avatar"
          style={{ position: "relative", width: 62, height: 62, padding: 0, borderRadius: 99, cursor: "pointer", border: "none", background: "none", lineHeight: 0 }}>
          {loreOn ? (
            // A lore icon is currently chosen — preview it; the badge invites a re-roll.
            <div aria-hidden style={disc(avatarSrc(value)!, true)} />
          ) : (
            <span style={{ display: "grid", placeItems: "center", width: "100%", height: "100%", borderRadius: 99, background: "var(--bg)", border: "2px dashed var(--line)" }}>
              <Dices size={24} color="var(--accent3)" />
            </span>
          )}
          <span style={{ position: "absolute", bottom: -3, right: -3, display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 99, background: loreOn ? "var(--ink)" : "var(--accent3)", border: "2px solid var(--panel)" }}>
            <Dices size={11} strokeWidth={2.5} color="var(--bg)" />
          </span>
        </button>
      )}
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
  // Colours stay unique per household — they identify each member across the app
  // (hero dots, progress bars, "who played"). The icon itself can repeat, since
  // the colour differentiates a teal cat from a pink one. The user's own current
  // colour is never blocked, so a pre-existing clash can still be kept.
  const takenColors = new Set(others.map((o) => o.color));
  const clash = color !== currentUser.color && takenColors.has(color);
  const dirty = !!avatar && !clash && (avatar !== currentUser.avatar || color !== currentUser.color);

  const lbl: React.CSSProperties = { fontSize: 10, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, marginBottom: 10, display: "block" };

  // Roll a random gaming-lore icon, avoiding the current pick so a re-roll always
  // lands on something new.
  const generate = () => setAvatar(randomLoreAvatar(avatar ? [avatar] : []));

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try { await onSave({ avatar: avatar!, color }); onClose(); } finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000c", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }} className="sheet-backdrop">
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "100%", maxWidth: 560, maxHeight: "calc(94vh - env(safe-area-inset-top))", overflowY: "auto", background: "var(--panel)", border: "1px solid var(--line)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: "20px 20px calc(20px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontFamily: "var(--display)", fontSize: 16, color: "var(--accent)" }}>ICON &amp; COLOUR</div>
          <button onClick={onClose} style={{ display: "grid", placeItems: "center", width: 32, height: 32, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink)", padding: 0 }}><X size={16} /></button>
        </div>

        <label style={lbl}>ICON</label>
        {/* Each tile previews the icon over the live colour choice. The dice tile
            rolls a random gaming-lore icon. */}
        <AvatarGrid value={avatar} color={color} onSelect={setAvatar} onGenerate={generate} />
        <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8 }}>Tap the dice for a random gaming-lore icon.</div>

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
