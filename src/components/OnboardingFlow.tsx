"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Joystick, Home, Ticket, AlertCircle, Loader2, Plus, LogIn } from "lucide-react";

// Shown to a signed-in user who isn't in a household yet. They either create
// their own vault (becoming its owner) or join an existing one with an invite
// code. Both go through the SECURITY DEFINER RPCs — the only sanctioned way to
// create/join — and on success we refresh the session (so middleware sees the
// new membership) before entering the app.
export default function OnboardingFlow({ initialInvite = "" }: { initialInvite?: string }) {
  const router = useRouter();
  const supabase = createClient();
  // Default to "join" when arriving via an invite link, otherwise "create".
  const [mode, setMode] = useState<"create" | "join">(initialInvite ? "join" : "create");
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialInvite);
  const [err, setErr] = useState("");
  const [phase, setPhase] = useState<"idle" | "working" | "redirecting">("idle");
  const busy = phase !== "idle";

  async function submit() {
    if (busy) return;
    setErr(""); setPhase("working");
    try {
      if (mode === "create") {
        if (!name.trim()) throw new Error("Give your vault a name.");
        const { error } = await supabase.rpc("create_household", { p_name: name.trim() });
        if (error) throw error;
      } else {
        if (!code.trim()) throw new Error("Enter an invite code.");
        const { error } = await supabase.rpc("join_household", { p_code: code.trim() });
        if (error) throw error;
      }
      // Refresh the JWT so the new household membership is reflected before the
      // middleware gate re-evaluates on the next navigation.
      setPhase("redirecting");
      await supabase.auth.refreshSession();
      router.refresh();
      router.push("/");
    } catch (e: any) {
      setErr(friendlyError(e, mode));
      setPhase("idle");
    }
  }

  const inp: React.CSSProperties = {
    width: "100%", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)",
    color: "var(--ink)", padding: "12px 14px", fontSize: 15, fontFamily: "var(--body)", outline: "none", boxSizing: "border-box",
  };
  // Flex so the icon and label text sit on one line, vertically centred; the
  // bottom margin is the gap before the input below.
  const lbl: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 10, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, marginBottom: 8,
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(700px 420px at 80% -10%, #e0738a14, transparent), radial-gradient(620px 420px at -10% 110%, #6fc7b312, transparent)" }} />
      <div className="fade" style={{ position: "relative", width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 26 }}>
          <div style={{ width: 52, height: 52, display: "grid", placeItems: "center", background: "var(--accent)", borderRadius: 14, color: "var(--bg)", marginBottom: 14 }}>
            <Joystick size={28} strokeWidth={2.5} />
          </div>
          <div style={{ fontFamily: "var(--display)", fontSize: 22, letterSpacing: 1, fontWeight: 700 }}>GAMEVAULT</div>
          <div style={{ fontSize: 12, color: "var(--ink-dim)", fontFamily: "var(--display)", letterSpacing: 1, marginTop: 6 }}>
            {mode === "create" ? "Set up your vault" : "Join a vault"}
          </div>
        </div>

        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 22 }}>
          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 6, background: "var(--bg)", padding: 5, borderRadius: 99, border: "1px solid var(--line)", marginBottom: 20 }}>
            {([["create", "Create", Plus], ["join", "Join", LogIn]] as const).map(([k, label, Ic]) => (
              <button key={k} onClick={() => { setMode(k); setErr(""); }}
                style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", border: "none", cursor: "pointer",
                  borderRadius: 99, fontFamily: "var(--display)", fontWeight: 700, fontSize: 12.5, letterSpacing: 1,
                  background: mode === k ? "var(--accent)" : "transparent", color: mode === k ? "var(--bg)" : "var(--ink-dim)" }}>
                <Ic size={14} strokeWidth={2.5} /> {label.toUpperCase()}
              </button>
            ))}
          </div>

          {mode === "create" ? (
            <>
              <label style={lbl}><Home size={12} />VAULT NAME</label>
              <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Smith Household"
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
              <div style={{ fontSize: 11.5, color: "var(--ink-dim)", lineHeight: 1.5, marginTop: 10 }}>
                You&apos;ll be the owner. Invite household members afterwards from Settings.
              </div>
            </>
          ) : (
            <>
              <label style={lbl}><Ticket size={12} />INVITE CODE</label>
              <input style={{ ...inp, textTransform: "uppercase", letterSpacing: 2, fontFamily: "var(--display)" }} value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD2345" autoCapitalize="characters"
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
              <div style={{ fontSize: 11.5, color: "var(--ink-dim)", lineHeight: 1.5, marginTop: 10 }}>
                Ask the vault owner for the code (or open their invite link).
              </div>
            </>
          )}

          {err && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 14, color: "var(--bad)", fontSize: 12, fontFamily: "var(--display)" }}>
              <AlertCircle size={14} /> {err}
            </div>
          )}

          <button onClick={submit} disabled={busy}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18,
              padding: "13px 0", border: "none", borderRadius: "var(--radius)", cursor: busy ? "wait" : "pointer", background: "var(--accent2)", color: "var(--bg)",
              fontFamily: "var(--display)", fontWeight: 700, fontSize: 14, opacity: busy ? 0.6 : 1 }}>
            {phase === "redirecting"
              ? <><Loader2 size={16} className="spin" /> OPENING VAULT…</>
              : phase === "working"
                ? <><Loader2 size={16} className="spin" /> {mode === "create" ? "CREATING…" : "JOINING…"}</>
                : mode === "create" ? <><Plus size={16} strokeWidth={3} /> CREATE VAULT</> : <><LogIn size={16} /> JOIN VAULT</>}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 18 }}>
          <form action="/api/signout" method="post">
            <button type="submit"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11.5, fontFamily: "var(--display)", fontWeight: 700, letterSpacing: 0.5 }}>
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// Translate Postgres/RPC errors into copy a household member understands.
function friendlyError(e: any, mode: "create" | "join"): string {
  const msg = String(e?.message ?? "").toLowerCase();
  if (msg.includes("already in a household") || e?.code === "23505") return "You're already in a vault.";
  if (msg.includes("invalid invite")) return "That invite code doesn't match any vault.";
  if (msg.includes("name required")) return "Give your vault a name.";
  if (msg.includes("not authenticated")) return "Your session expired — sign in again.";
  return e?.message || (mode === "create" ? "Couldn't create the vault." : "Couldn't join the vault.");
}
