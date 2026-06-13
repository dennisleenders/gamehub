"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";

// A first-run guided tour for the dashboard. Each step points at a real element
// (matched by a `data-tut` attribute) and dims everything else, leaving that
// element in a spotlight. The whole screen is a click target: a tap anywhere
// advances to the next step, the last tap closes the tour. A small step counter
// shows progress; a corner X skips the rest.
export type TutorialStep = {
  // CSS selector for the element to spotlight (e.g. '[data-tut="add"]').
  selector: string;
  title: string;
  body: string;
};

type Box = { top: number; left: number; width: number; height: number };

const PAD = 9; // breathing room between the element and the spotlight edge

export default function TutorialOverlay({ steps, onClose }: { steps: TutorialStep[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  // Place the text card on the opposite side of the screen from the highlight so
  // the two never overlap: highlight up top → card sits lower, and vice versa.
  const [cardSide, setCardSide] = useState<"top" | "bottom">("bottom");
  const rafRef = useRef<number | null>(null);

  const step = steps[i];
  const isLast = i >= steps.length - 1;

  const measure = useCallback(() => {
    const el = step ? (document.querySelector(step.selector) as HTMLElement | null) : null;
    if (!el) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    const mid = r.top + r.height / 2;
    setCardSide(mid < window.innerHeight * 0.5 ? "bottom" : "top");
  }, [step]);

  // Snap before paint on step change, then keep the spotlight glued to the element
  // through scrolls, resizes and late layout settling (fonts, the nav orb sliding).
  useLayoutEffect(() => { measure(); }, [measure]);
  useEffect(() => {
    const onMove = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    const t1 = setTimeout(measure, 80);
    const t2 = setTimeout(measure, 260);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      clearTimeout(t1); clearTimeout(t2);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [measure]);

  // Esc closes; advancing with the keyboard mirrors a tap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "Enter" || e.key === " ") advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const advance = () => { if (isLast) onClose(); else setI((n) => n + 1); };

  if (!step) return null;

  const cardVertical: React.CSSProperties = box
    ? cardSide === "bottom"
      ? { top: Math.min(box.top + box.height + 18, window.innerHeight - 220) }
      : { bottom: Math.min(window.innerHeight - box.top + 18, window.innerHeight - 220) }
    : { top: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div
      onClick={advance}
      style={{ position: "fixed", inset: 0, zIndex: 1000, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
      role="dialog"
      aria-label="Dashboard tour"
    >
      {/* Spotlight: a single box whose enormous box-shadow IS the dark overlay, so
          everything outside the box is dimmed and the box itself stays clear. */}
      {box && (
        <>
          <div
            style={{
              position: "fixed", top: box.top, left: box.left, width: box.width, height: box.height,
              borderRadius: 14, boxShadow: "0 0 0 9999px rgba(9,7,14,0.84)", pointerEvents: "none",
              transition: "top .44s cubic-bezier(.4,0,.2,1), left .44s cubic-bezier(.4,0,.2,1), width .44s cubic-bezier(.4,0,.2,1), height .44s cubic-bezier(.4,0,.2,1)",
            }}
          />
          {/* Glowing, gently pulsing ring around the spotlight to pull the eye. */}
          <div
            className="tut-ring"
            style={{
              position: "fixed", top: box.top, left: box.left, width: box.width, height: box.height,
              borderRadius: 14, border: "2px solid var(--accent2)", pointerEvents: "none",
              transition: "top .44s cubic-bezier(.4,0,.2,1), left .44s cubic-bezier(.4,0,.2,1), width .44s cubic-bezier(.4,0,.2,1), height .44s cubic-bezier(.4,0,.2,1)",
            }}
          />
        </>
      )}
      {/* Plain dim when no element matched, so the card still reads. */}
      {!box && <div style={{ position: "fixed", inset: 0, background: "rgba(9,7,14,0.84)", pointerEvents: "none" }} />}

      {/* Skip — the one bit that swallows its click instead of advancing. */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Skip tour"
        style={{
          position: "fixed", top: "calc(14px + env(safe-area-inset-top))", left: 14, zIndex: 1002,
          display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 13px", borderRadius: 99,
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", cursor: "pointer",
          color: "#fff", fontFamily: "var(--display)", fontSize: 11, fontWeight: 700, letterSpacing: 1,
          backdropFilter: "blur(6px)",
        }}
      >
        SKIP <X size={13} strokeWidth={2.5} />
      </button>

      {/* Text card. key={i} replays the entrance each step. pointerEvents:none so a
          tap on it still bubbles up to the screen and advances. */}
      <div
        key={i}
        className="tut-card"
        style={{
          position: "fixed", left: "50%", width: "min(380px, calc(100vw - 32px))",
          transform: "translateX(-50%)", zIndex: 1001, pointerEvents: "none",
          ...cardVertical,
        }}
      >
        <div
          style={{
            background: "linear-gradient(160deg, var(--panel-alt), var(--panel))",
            border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "18px 20px 16px",
            boxShadow: "0 18px 50px -12px #000, 0 0 0 1px rgba(111,199,179,0.18)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 11 }}>
            <span style={{ fontFamily: "var(--display)", fontSize: 10.5, fontWeight: 700, letterSpacing: 2, color: "var(--accent2)" }}>
              STEP {i + 1} / {steps.length}
            </span>
            <div style={{ display: "flex", gap: 5 }}>
              {steps.map((_, n) => (
                <span
                  key={n}
                  style={{
                    width: n === i ? 18 : 6, height: 6, borderRadius: 99,
                    background: n === i ? "var(--accent2)" : "rgba(255,255,255,0.2)",
                    transition: "width .3s ease, background .3s ease",
                  }}
                />
              ))}
            </div>
          </div>
          <div style={{ fontFamily: "var(--display)", fontSize: 19, fontWeight: 800, letterSpacing: -0.3, marginBottom: 7, color: "var(--ink)" }}>
            {step.title}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-dim)" }}>{step.body}</div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11.5, color: "var(--ink-dim)", fontFamily: "var(--display)", letterSpacing: 0.5 }}>
              {isLast ? "Tap to finish" : "Tap anywhere to continue"}
            </span>
            <span
              style={{
                fontFamily: "var(--display)", fontSize: 11, fontWeight: 700, letterSpacing: 1, padding: "6px 14px",
                borderRadius: 99, background: "var(--accent2)", color: "var(--bg)",
              }}
            >
              {isLast ? "DONE" : "NEXT"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
