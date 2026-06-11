"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Joystick, Lock, UserPlus, AlertCircle, Loader2, MailCheck } from "lucide-react";
import { AvatarGrid } from "@/components/Avatar";
import { AVATARS, randomLoreAvatar } from "@/lib/avatars";
import { PROFILE_COLORS } from "@/lib/types";

function LoginForm() {
  const router = useRouter();
  const supabase = createClient();
  // Set when arriving via an invite link (/join/<code> → /login?invite=<code>).
  // We carry it through sign-in so the user lands back on the join flow.
  const invite = useSearchParams().get("invite") ?? "";
  const dest = invite ? `/onboarding?invite=${encodeURIComponent(invite)}` : "/";
  // True once a signup needs email confirmation (no session returned yet).
  const [sent, setSent] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(PROFILE_COLORS[0]);
  const [avatar, setAvatar] = useState(AVATARS[0].id);
  const [err, setErr] = useState("");
  // idle → working (authenticating) → redirecting (success, navigating away).
  // We deliberately stay in `redirecting` through the navigation so the button
  // never flips back to its default label after a successful sign-in.
  const [phase, setPhase] = useState<"idle" | "working" | "redirecting">("idle");
  const busy = phase !== "idle";

  async function submit() {
    if (busy) return;
    setErr(""); setPhase("working");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
      } else {
        if (!name.trim()) throw new Error("Choose a name.");
        // If email confirmation is on, the link returns the user to the join/
        // onboarding flow (with the invite preserved) rather than a bare app.
        const emailRedirectTo = typeof window !== "undefined" ? `${window.location.origin}${dest}` : undefined;
        const { data, error } = await supabase.auth.signUp({
          email, password: pass,
          options: { data: { name: name.trim(), color, avatar }, emailRedirectTo },
        });
        if (error) throw error;
        // Email confirmation on → no session yet. Don't redirect into a gated
        // app they can't enter; ask them to confirm first.
        if (!data.session) { setSent(true); setPhase("idle"); return; }
      }
      // Success — keep the button loading through the redirect (no flip back to
      // the default label). The session is persisted by Supabase and
      // auto-refreshed by middleware — the "never log out" behaviour. An invite
      // routes via /onboarding so the join completes; otherwise straight in.
      setPhase("redirecting");
      router.refresh();
      router.push(dest);
    } catch (e: any) {
      setErr(e.message ?? "Something went wrong.");
      setPhase("idle");
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
            {invite ? "Sign in to join the vault" : mode === "login" ? "Welcome back" : "Create your player"}
          </div>
        </div>

        <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 22 }}>
          {sent ? (
            <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
              <div style={{ width: 48, height: 48, display: "grid", placeItems: "center", margin: "0 auto 14px", background: "var(--good)", borderRadius: 14, color: "var(--bg)" }}>
                <MailCheck size={26} strokeWidth={2.5} />
              </div>
              <div style={{ fontFamily: "var(--display)", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>CHECK YOUR EMAIL</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.6 }}>
                We sent a confirmation link to <span style={{ color: "var(--ink)" }}>{email}</span>. Open it to finish setting up your account{invite ? " and join the vault" : ""}.
              </div>
              <button onClick={() => { setSent(false); setMode("login"); }}
                style={{ marginTop: 18, background: "none", border: "none", cursor: "pointer", color: "var(--accent2)", fontSize: 12.5, fontFamily: "var(--display)", fontWeight: 700 }}>
                ← Back to sign in
              </button>
            </div>
          ) : (
          <>
          {mode === "register" && (
            <>
              <label style={lbl}>YOUR NAME</label>
              <input style={{ ...inp, marginBottom: 16 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" />
              <label style={lbl}>PICK A COLOUR</label>
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                {PROFILE_COLORS.map((c) => (
                  <button key={c} onClick={() => setColor(c)} aria-label="colour"
                    style={{ width: 30, height: 30, borderRadius: 99, background: c, cursor: "pointer",
                      border: color === c ? "3px solid var(--ink)" : "3px solid transparent" }} />
                ))}
              </div>
              <label style={lbl}>PICK AN AVATAR</label>
              <div style={{ marginBottom: 16 }}>
                <AvatarGrid value={avatar} color={color} onSelect={setAvatar}
                  onGenerate={() => setAvatar(randomLoreAvatar(avatar ? [avatar] : []))} />
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
              padding: "13px 0", border: "none", borderRadius: "var(--radius)", cursor: busy ? "wait" : "pointer", background: "var(--accent2)", color: "var(--bg)",
              fontFamily: "var(--display)", fontWeight: 700, fontSize: 14, opacity: busy ? 0.6 : 1 }}>
            {phase === "redirecting"
              ? <><Loader2 size={16} className="spin" /> OPENING VAULT…</>
              : phase === "working"
                ? <><Loader2 size={16} className="spin" /> {mode === "login" ? "SIGNING IN…" : "CREATING…"}</>
                : mode === "login" ? <><Lock size={16} /> ENTER VAULT</> : <><UserPlus size={16} /> CREATE & ENTER</>}
          </button>

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)", textAlign: "center" }}>
            <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent2)", fontSize: 12.5, fontFamily: "var(--display)", fontWeight: 700 }}>
              {mode === "login" ? "New here? Create a player" : "← Back to sign in"}
            </button>
          </div>
          </>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 10.5, color: "var(--ink-dim)", fontFamily: "var(--display)", lineHeight: 1.6 }}>
          Stays signed in on this device.
        </div>
      </div>
    </div>
  );
}

// useSearchParams() must sit under a Suspense boundary in Next 15.
export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
      <LoginForm />
    </Suspense>
  );
}
