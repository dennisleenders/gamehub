"use client";

import { useEffect } from "react";

// Clears the home-screen app-icon badge whenever the app is open / brought to the
// foreground. The badge is SET by the service worker's push handler (the only code
// that runs while the app is closed on iOS) — this hook just makes sure it goes
// away the moment you actually look at the app. No-op where badging is unsupported.
export function useAppBadge() {
  useEffect(() => {
    const supported = typeof navigator !== "undefined" && "clearAppBadge" in navigator;
    if (!supported) return;

    const clear = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      navigator.clearAppBadge?.().catch(() => {});
    };

    clear(); // clear on open
    document.addEventListener("visibilitychange", clear);
    window.addEventListener("focus", clear);
    return () => {
      document.removeEventListener("visibilitychange", clear);
      window.removeEventListener("focus", clear);
    };
  }, []);
}
