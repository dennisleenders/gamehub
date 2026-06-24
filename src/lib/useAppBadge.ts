"use client";

import { useEffect } from "react";

// Keeps the home-screen app-icon badge honest. The badge is SET by the service
// worker's push handler (the only code that runs while the app is closed on iOS),
// where its value is the number of notifications still pending in the tray. This
// hook, on open/foreground, both clears the badge AND dismisses those pending
// notifications — otherwise old tray items keep inflating the next push's count
// (you'd see 5, then 6, instead of 1). No-op where unsupported.
export function useAppBadge() {
  useEffect(() => {
    const onForeground = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if ("clearAppBadge" in navigator) navigator.clearAppBadge?.().catch(() => {});
      try {
        const reg = await navigator.serviceWorker?.ready;
        const pending = (await reg?.getNotifications()) ?? [];
        pending.forEach((n) => n.close());
      } catch {
        /* no SW / not supported */
      }
    };

    onForeground(); // clear on open
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);
    return () => {
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
    };
  }, []);
}
