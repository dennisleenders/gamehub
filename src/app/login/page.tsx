"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Joystick, Lock, UserPlus, AlertCircle } from "lucide-react";

const COLORS = ["#6fc7b3", "#e0738a", "#e6b667", "#7fb2ff", "#c98cff", "#7fd98a"];

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(""); setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
      } else {
        if (!name.trim()) throw new Error("Choose a name.");
        const { error } = await supabase.auth.signUp({
          email, password: pass,
          options: { data: { name: name.trim(), color } },
        });
        if (error) throw error;
      }
      // Session is persisted by Supabase and auto-refreshed by middleware —
      // this is the "never log out" behaviour.
      router.refresh();
      router.push("/");
    } catch (e: any) {
      setErr(e.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const inp: React.CSSProperties = {
    width: "100%", background: "var(--bg)", border: "1px solid var(--line)", borderRadius: "var(--radius)",
    color: "var(--ink)", padding: "12px 14px", fontSize: 15, fontFamily: "var(--body)", outline: "none", boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = {
    fontSize: 10, letterSpacing: 1.5, color: "var(--ink-dim)", fontFamily: "var(--display)", fontWeight: 700, marginBottom: 8, display: "block",
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
            {mode === "login" ? "Welcome back" : "Create your player"}
          </div>
        </div>

        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 22 }}>
          {mode === "register" && (
            <>
              <label style={lbl}>YOUR NAME</label>
              <input style={{ ...inp, marginBottom: 16 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" />
              <label style={lbl}>PICK A COLOUR</label>
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setColor(c)} aria-label="colour"
                    style={{ width: 30, height: 30, borderRadius: 99, background: c, cursor: "pointer",
                      border: color === c ? "3px solid var(--ink)" : "3px solid transparent" }} />
                ))}
              </div>
            </>
          )}
          <label style={lbl}>EMAIL</label>
          <input style={{ ...inp, marginBottom: 14 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <label style={lbl}>PASSWORD</label>
          <input style={inp} type="password" value={pass} onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="••••••••" />

          {err && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 14, color: "var(--bad)", fontSize: 12, fontFamily: "var(--display)" }}>
              <AlertCircle size={14} /> {err}
            </div>
          )}

          <button onClick={submit} disabled={busy}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18,
              padding: "13px 0", border: "none", borderRadius: "var(--radius)", cursor: "pointer", background: "var(--accent2)", color: "var(--bg)",
              fontFamily: "var(--display)", fontWeight: 700, fontSize: 14, opacity: busy ? 0.6 : 1 }}>
            {mode === "login" ? <><Lock size={16} /> ENTER VAULT</> : <><UserPlus size={16} /> CREATE & ENTER</>}
          </button>

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)", textAlign: "center" }}>
            <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent2)", fontSize: 12.5, fontFamily: "var(--display)", fontWeight: 700 }}>
              {mode === "login" ? "New here? Create a player" : "← Back to sign in"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 10.5, color: "var(--ink-dim)", fontFamily: "var(--display)", lineHeight: 1.6 }}>
          Stays signed in on this device.
        </div>
      </div>
    </div>
  );
}
