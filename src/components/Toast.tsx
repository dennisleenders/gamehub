"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

// A generic, app-wide notification system. Anything under <ToastProvider> can
// call useToast().notify(...) to slide a card in from the top. Each toast
// auto-dismisses after `duration` ms (default 5s; pass 0 to make it sticky) and
// can always be closed manually. Built to carry any info served to the user —
// achievement milestones are the first consumer, but it's not specific to them.

export interface ToastInput {
  title: string;
  message?: string;
  /** CSS color for the accent bar + icon tint. Defaults to the teal accent. */
  accent?: string;
  /** Optional leading icon (a lucide icon element, etc.). */
  icon?: ReactNode;
  /** Auto-dismiss delay in ms. Default 5000. 0 keeps it until closed. */
  duration?: number;
  /** If set, the card becomes tappable and runs this on click (e.g. "refresh to update"). */
  onClick?: () => void;
}

interface ToastItem extends ToastInput {
  id: number;
  leaving?: boolean;
}

interface ToastContextValue {
  notify: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a <ToastProvider>");
  return ctx;
}

const EXIT_MS = 240; // keep in sync with the toast-out animation in globals.css

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  // Play the exit animation, then drop the toast from state.
  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const notify = useCallback((input: ToastInput) => {
    const id = (idRef.current += 1);
    setToasts((ts) => [...ts, { ...input, id }]);
    const duration = input.duration ?? 5000;
    if (duration > 0) setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <ToastViewport toasts={toasts} onClose={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, onClose }: { toasts: ToastItem[]; onClose: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    // Sits above every modal (max app z-index is 80). The container ignores
    // pointer events so it never blocks the UI; each card re-enables them.
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
      padding: "calc(12px + env(safe-area-inset-top)) 12px 0", pointerEvents: "none",
    }}>
      {toasts.map((t) => <ToastCard key={t.id} toast={t} onClose={() => onClose(t.id)} />)}
    </div>
  );
}

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const accent = toast.accent || "var(--accent2)";
  return (
    <div
      className={toast.leaving ? "toast toast-out" : "toast toast-in"}
      onClick={toast.onClick ? () => toast.onClick!() : undefined}
      role={toast.onClick ? "button" : undefined}
      style={{
        pointerEvents: "auto", width: "100%", maxWidth: 420, display: "flex", alignItems: "flex-start", gap: 11,
        background: "var(--panel)", border: "1px solid var(--line)", borderLeft: `3px solid ${accent}`,
        borderRadius: "var(--radius)", padding: "12px 12px 12px 14px", boxShadow: "0 14px 34px -12px #000",
        cursor: toast.onClick ? "pointer" : "default",
      }}
    >
      {toast.icon && <span style={{ flexShrink: 0, color: accent, marginTop: 1, lineHeight: 0 }}>{toast.icon}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "var(--display)" }}>{toast.title}</div>
        {toast.message && <div style={{ fontSize: 12.5, color: "var(--ink-dim)", marginTop: 3, lineHeight: 1.4 }}>{toast.message}</div>}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Dismiss" style={{
        flexShrink: 0, display: "grid", placeItems: "center", width: 24, height: 24, padding: 0,
        background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 99, cursor: "pointer", color: "var(--ink-dim)",
      }}>
        <X size={13} />
      </button>
    </div>
  );
}
