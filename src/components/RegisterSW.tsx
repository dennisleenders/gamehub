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
// activate, and the resulting controllerchange reloads the page onto the new build.
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

    const promptUpdate = (worker: ServiceWorker) => {
      notify({
        title: "Update available",
        message: "Tap to refresh to the latest version.",
        icon: <RefreshCw size={16} />,
        duration: 0,
        onClick: () => worker.postMessage({ type: "SKIP_WAITING" }),
      });
    };

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
        // An update may already be waiting from a previous visit.
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
      }).catch(() => {
        /* registration failure is non-fatal */
      });
    };
    window.addEventListener("load", onLoad);
    return () => {
      window.removeEventListener("load", onLoad);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [notify]);

  return null;
}
