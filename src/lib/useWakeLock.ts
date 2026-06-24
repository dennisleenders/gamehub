"use client";

import { useEffect, useRef } from "react";

// Holds a screen wake lock while `active` is true (e.g. the barcode scanner is
// open) so the phone doesn't dim or lock mid-scan. The OS auto-releases the lock
// whenever the page is hidden, so we re-acquire it when visibility returns.
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
    if (!supported || !active) return;

    let released = false;
    const acquire = async () => {
      try {
        lockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        /* denied or page not visible — ignore */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && !released) acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
