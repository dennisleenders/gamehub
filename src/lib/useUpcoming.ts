"use client";

import { useEffect, useState } from "react";
import type { UpcomingGame } from "@/lib/types";

// Fetches upcoming releases (next 6 months) once per session, lazily — only when
// `enabled` first becomes true (the dashboard block is shown or the Upcoming view
// is opened). The result is held for the session; the data changes slowly and the
// server layers add their own caching.
export function useUpcoming(enabled: boolean) {
  const [games, setGames] = useState<UpcomingGame[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Fetch once, the first time it's needed. `loading` is deliberately NOT a
  // dependency here: setting it inside the effect would otherwise re-run the
  // effect and fire the cleanup (active = false) on the same render that started
  // the request, so the in-flight result would be discarded and we'd spin
  // forever. Gating on `games` keeps it to a single fetch and is safe under
  // StrictMode's double-invoke (the second pass still sees games === null and
  // the last fetch wins).
  useEffect(() => {
    if (!enabled || games) return;
    let active = true;
    setLoading(true);
    setError(false);
    fetch("/api/upcoming")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("request failed"))))
      .then((d) => { if (active) setGames(d.games ?? []); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, games]);

  return { games, loading, error };
}
