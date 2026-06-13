"use client";

import { useEffect, useState } from "react";
import { Share, X } from "lucide-react";

const DISMISS_KEY = "gv-ios-install-dismissed";

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as Mac but is touch-capable.
  const iPadOS13 = navigator.platform === "MacIntel" && (navigator as { maxTouchPoints?: number }).maxTouchPoints! > 1;
  return iOSDevice || iPadOS13;
}

function isStandalone(): boolean {
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  const mql = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  return iosStandalone || mql;
}

// One-time, dismissible hint shown only in iOS Safari (not once installed), since
// iOS gives no automatic install prompt. Decides on mount to avoid SSR mismatch.
export default function IosInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIos() || isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    let timer: ReturnType<typeof setTimeout>;
    // The dashboard raises this while a first-run tour is pending or on screen so
    // the two never overlap; it's unset on pages without a dashboard.
    const suppressed = () => (window as Window & { __gvSuppressInstall?: boolean }).__gvSuppressInstall === true;
    // Wait for first paint / login to settle, then reveal — but not while a tour
    // is in play; the re-check inside the timer covers a tour starting mid-delay.
    const schedule = () => {
      clearTimeout(timer);
      if (suppressed()) return;
      timer = setTimeout(() => { if (!suppressed()) setShow(true); }, 1200);
    };
    // Tour starts → cancel any pending reveal and pull the hint if it's up.
    // Tour ends → (re)schedule the reveal.
    const onSuppress = (e: Event) => {
      if ((e as CustomEvent<boolean>).detail) { clearTimeout(timer); setShow(false); }
      else schedule();
    };
    window.addEventListener("gv:install-suppress", onSuppress);
    schedule();
    return () => { clearTimeout(timer); window.removeEventListener("gv:install-suppress", onSuppress); };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  return (
    <div role="dialog" aria-label="Install GameVault" className="fade"
      style={{ position: "fixed", left: 12, right: 12, bottom: "calc(84px + env(safe-area-inset-bottom))", zIndex: 100, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 14, boxShadow: "0 12px 32px -10px #000" }}>
      <div style={{ display: "grid", placeItems: "center", width: 38, height: 38, flexShrink: 0, borderRadius: 10, background: "var(--accent2)", color: "var(--bg)" }}>
        <Share size={18} strokeWidth={2.5} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ink)" }}>Install GameVault</div>
        <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 2, lineHeight: 1.4 }}>
          Tap <Share size={12} style={{ display: "inline", verticalAlign: -1 }} /> Share, then <b>Add to Home Screen</b>.
        </div>
      </div>
      <button onClick={dismiss} aria-label="Dismiss"
        style={{ display: "grid", placeItems: "center", width: 30, height: 30, flexShrink: 0, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink-dim)", padding: 0 }}>
        <X size={15} />
      </button>
    </div>
  );
}
