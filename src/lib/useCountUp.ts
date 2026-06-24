"use client";

import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Animates a number from its previous displayed value up to `target` with an
// easeOutCubic curve. Used for the hero points / tiers totals and tile point
// counts. Honours prefers-reduced-motion (jumps straight to the target). Animates
// from the last shown value (not always 0) so a realtime data refresh doesn't
// snap back to zero and re-count.
export function useCountUp(target: number, ms = 900): number {
  // Start at 0 so the first mount counts up; subsequent target changes animate
  // from the last shown value (fromRef), not back from 0.
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    if (prefersReducedMotion()) { fromRef.current = target; setValue(target); return; }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (target - from) * eased);
      fromRef.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return value;
}
