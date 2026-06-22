"use client";

import { useEffect, useState } from "react";
import type { GameEvent } from "@/lib/types";

// Fetches industry events (recent past + next ~12 months) once per session,
// lazily — only when `enabled` first becomes true (the Upcoming view's Events
// section is opened). Mirrors useUpcoming: the result is held for the session;
// the data changes slowly and the server layers add their own caching. See the
// note there on why `loading` is deliberately not an effect dependency.
export function useEvents(enabled: boolean) {
  const [events, setEvents] = useState<GameEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled || events) return;
    let active = true;
    setLoading(true);
    setError(false);
    fetch("/api/events")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("request failed"))))
      .then((d) => { if (active) setEvents(d.events ?? []); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, events]);

  return { events, loading, error };
}
