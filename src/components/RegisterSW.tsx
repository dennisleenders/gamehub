"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/components/Toast";

// Registers the service worker in production. In dev it does the opposite:
// actively unregisters any SW (and clears its caches) left behind by a prior
// `npm run start` PWA test — otherwise the prod SW keeps controlling the origin
// and serves stale, non-content-hashed dev chunks, breaking the app.
//
// On a deploy the new worker installs and WAITS (sw.js no longer skipWaiting()s on
// install). We surface a tap-to-refresh toast; tapping tells the waiting worker to
// activate, and the resulting controllerchange reloads onto the new build.
//
// A bare foreground (app switched back, no page reload) doesn't re-fetch sw.js, so
// we'd otherwise miss new builds until a full restart. We fix that by checking for
// an update on every return to the foreground.
export default function RegisterSW() {
  const { notify } = useToast();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
      if (typeof caches !== "undefined") {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      return;
    }

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let registration: ServiceWorkerRegistration | null = null;
    let prompted = false;
    const promptUpdate = (worker: ServiceWorker) => {
      if (prompted) return; // don't stack toasts on repeated foregrounds
      prompted = true;
      notify({
        title: "Update available",
        message: "Tap to refresh to the latest version.",
        icon: <RefreshCw size={16} />,
        duration: 0,
        onClick: () => worker.postMessage({ type: "SKIP_WAITING" }),
      });
    };

    const watch = (reg: ServiceWorkerRegistration) => {
      // A worker that already installed-and-parked (from an earlier check).
      if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // "installed" + an existing controller => an update (not the first install).
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            promptUpdate(installing);
          }
        });
      });
    };

    // Returning to the foreground: re-surface an already-waiting worker, otherwise
    // ask the browser to re-fetch sw.js and look for a new build. The network check
    // is throttled; prompting a waiting worker is local + idempotent (guarded above).
    let lastCheck = 0;
    const checkForUpdate = () => {
      if (document.visibilityState !== "visible" || !registration) return;
      if (registration.waiting && navigator.serviceWorker.controller) {
        promptUpdate(registration.waiting);
        return;
      }
      const now = Date.now();
      if (now - lastCheck < 20_000) return;
      lastCheck = now;
      registration.update().catch(() => {});
    };

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
        registration = reg;
        watch(reg);
      }).catch(() => {
        /* registration failure is non-fatal */
      });
    };
    window.addEventListener("load", onLoad);
    document.addEventListener("visibilitychange", checkForUpdate);
    return () => {
      window.removeEventListener("load", onLoad);
      document.removeEventListener("visibilitychange", checkForUpdate);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [notify]);

  return null;
}
