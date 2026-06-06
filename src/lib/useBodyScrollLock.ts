"use client";

import { useEffect } from "react";

// Locks background page scroll while a full-screen overlay (detail view, modals,
// scanner) is mounted. Uses the position:fixed technique rather than
// `overflow:hidden` — the latter doesn't stop touch scroll-through on iOS/Android,
// where a swipe on the overlay backdrop still chains to the page behind it.
//
// Ref-counted so stacked overlays — e.g. opening the edit modal from the detail
// view — only capture/restore the scroll position once, on the outermost lock.
let locks = 0;
let savedScrollY = 0;

export function useBodyScrollLock() {
  useEffect(() => {
    locks += 1;
    if (locks === 1) {
      savedScrollY = window.scrollY;
      const { style } = document.body;
      style.position = "fixed";
      style.top = `-${savedScrollY}px`;
      style.left = "0";
      style.right = "0";
      style.width = "100%";
    }
    return () => {
      locks = Math.max(0, locks - 1);
      if (locks === 0) {
        const { style } = document.body;
        style.position = "";
        style.top = "";
        style.left = "";
        style.right = "";
        style.width = "";
        // Restore the pre-lock scroll position the fixed body discarded.
        window.scrollTo(0, savedScrollY);
      }
    };
  }, []);
}
