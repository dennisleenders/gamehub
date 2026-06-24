"use client";

import { useCallback, useEffect, useRef } from "react";

// Drives the home-screen app-icon badge on an installed PWA (iOS 16.4+ / Android).
// `bump()` increments the count when new partner activity arrives while the app is
// backgrounded; the badge clears the moment the user returns. The count is
// intentionally ephemeral (not persisted) — a "since you last looked" nudge, not
// a durable inbox count.
export function useAppBadge() {
  const countRef = useRef(0);
  const supported = typeof navigator !== "undefined" && "setAppBadge" in navigator;

  const clear = useCallback(() => {
    countRef.current = 0;
    if (supported) navigator.clearAppBadge?.().catch(() => {});
  }, [supported]);

  const bump = useCallback(() => {
    if (!supported) return;
    // Foreground activity is already visible in the UI — only badge when hidden.
    if (typeof document !== "undefined" && document.visibilityState === "visible") return;
    countRef.current += 1;
    navigator.setAppBadge?.(countRef.current).catch(() => {});
  }, [supported]);

  useEffect(() => {
    if (!supported) return;
    const onVisible = () => { if (document.visibilityState === "visible") clear(); };
    document.addEventListener("visibilitychange", onVisible);
    clear(); // clear any stale badge on a fresh open
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [supported, clear]);

  return { supported, bump, clear };
}
