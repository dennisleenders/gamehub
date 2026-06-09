"use client";

import { useEffect } from "react";

// Registers the service worker in production. In dev it does the opposite:
// actively unregisters any SW (and clears its caches) left behind by a prior
// `npm run start` PWA test — otherwise the prod SW keeps controlling the origin
// and serves stale, non-content-hashed dev chunks, breaking the app.
export default function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
      if (typeof caches !== "undefined") {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      return;
    }

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* registration failure is non-fatal */
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
