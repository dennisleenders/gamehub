"use client";
import { useEffect } from "react";

/**
 * Kills the zoom gestures iOS Safari leaves enabled even with
 * `user-scalable=no` (Apple deliberately ignores the viewport flag for pinch).
 * Double-tap zoom is handled by `touch-action: manipulation` in globals.css;
 * input-focus zoom by the 16px form-control rule. This covers the rest:
 *   - the non-standard `gesture*` events fired during a two-finger pinch
 *   - a multi-touch `touchmove` (pinch)
 */
export default function NoZoom() {
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    const onTouchMove = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };

    document.addEventListener("gesturestart", prevent, { passive: false });
    document.addEventListener("gesturechange", prevent, { passive: false });
    document.addEventListener("gestureend", prevent, { passive: false });
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", prevent);
      document.removeEventListener("gesturechange", prevent);
      document.removeEventListener("gestureend", prevent);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return null;
}
