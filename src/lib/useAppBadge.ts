"use client";

import { useEffect } from "react";

// Resets the home-screen app-icon badge whenever the app is opened / foregrounded.
// The badge is SET by the service worker's push handler (the only code that runs
// while the app is closed on iOS), where the count lives in a small IndexedDB
// value — NOT in the notification tray, because iOS won't let JS dismiss delivered
// notifications, so a tray-derived count would only ever grow. Here we zero that
// counter, clear the OS badge, and best-effort dismiss tray notifications (works
// on Android/desktop; iOS keeps them, but the count no longer depends on them).
const BADGE_DB = "gv-badge";

function resetBadgeCount(): Promise<void> {
  return new Promise((resolve) => {
    let open: IDBOpenDBRequest;
    try { open = indexedDB.open(BADGE_DB, 1); } catch { resolve(); return; }
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onerror = () => resolve();
    open.onsuccess = () => {
      try {
        const tx = open.result.transaction("kv", "readwrite");
        tx.objectStore("kv").put(0, "count");
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    };
  });
}

export function useAppBadge() {
  useEffect(() => {
    const onForeground = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      await resetBadgeCount();
      if ("clearAppBadge" in navigator) navigator.clearAppBadge?.().catch(() => {});
      try {
        const reg = await navigator.serviceWorker?.ready;
        const pending = (await reg?.getNotifications()) ?? [];
        pending.forEach((n) => n.close());
      } catch {
        /* no SW / not supported */
      }
    };

    onForeground(); // reset on open
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);
    return () => {
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
    };
  }, []);
}
