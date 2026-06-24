"use client";

import { useMemo } from "react";

const COLORS = ["var(--accent)", "var(--accent2)", "var(--accent3)", "var(--good)"];

// A one-shot, pure-CSS confetti burst rendered above the toast layer. Mounted by
// the parent on an achievement unlock and unmounted after the pieces fall (the
// parent owns the timer). Renders nothing under prefers-reduced-motion.
export function Confetti({ count = 44 }: { count?: number }) {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Randomise each piece once per mount so a re-render doesn't reshuffle them.
  const pieces = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      dur: 1.4 + Math.random() * 1,
      color: COLORS[i % COLORS.length],
      w: 6 + Math.random() * 5,
      h: 9 + Math.random() * 7,
    })),
    [count]);

  if (reduced) return null;

  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 101, overflow: "hidden" }}>
      {pieces.map((p, i) => (
        <span key={i} className="confetti-piece" style={{
          left: `${p.left}%`, width: p.w, height: p.h, background: p.color,
          ["--dur" as any]: `${p.dur}s`, ["--delay" as any]: `${p.delay}s`,
        }} />
      ))}
    </div>
  );
}
