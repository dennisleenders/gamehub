"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// The VAPID public key the browser signs its subscription against. Must match the
// private key the push-send Edge Function holds. Public by design (it's in the
// client bundle) — only the private half is secret.
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// PushManager wants the application server key as a Uint8Array, but VAPID keys are
// distributed as URL-safe base64. Standard conversion. The explicit
// Uint8Array<ArrayBuffer> keeps it assignable to BufferSource (applicationServerKey).
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// "unsupported" — no SW/Push/Notification API, or no VAPID key configured.
// "denied"      — the user blocked notifications (can only be undone in OS/browser settings).
// "default"     — supported & not blocked, but this device isn't subscribed.
// "subscribed"  — this device has an active push subscription.
export type PushState = "unsupported" | "denied" | "default" | "subscribed";

export function usePush(currentUserId: string, householdId: string) {
  const supabase = createClient();
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC;

  const [state, setState] = useState<PushState>("unsupported");
  const [busy, setBusy] = useState(false);

  // Resolve the current state once the SW is ready.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!cancelled) setState(sub ? "subscribed" : "default");
    })();
    return () => { cancelled = true; };
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported || busy) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "default");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
      const keys = sub.toJSON().keys ?? {};
      // Own-row write under RLS — same pattern as every other table in useVault.
      // Upsert on the unique endpoint so re-subscribing the same device is idempotent.
      await supabase.from("push_subscriptions").upsert(
        {
          endpoint: sub.endpoint,
          p256dh: keys.p256dh ?? "",
          auth: keys.auth ?? "",
          household_id: householdId,
          profile_id: currentUserId,
          user_agent: navigator.userAgent.slice(0, 300),
        },
        { onConflict: "endpoint" },
      );
      setState("subscribed");
    } catch {
      /* permission dismissed or subscribe failed — leave state as-is */
    } finally {
      setBusy(false);
    }
  }, [supported, busy, supabase, householdId, currentUserId]);

  const unsubscribe = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe().catch(() => {});
      }
      setState("default");
    } finally {
      setBusy(false);
    }
  }, [busy, supabase]);

  return { supported, state, busy, subscribe, unsubscribe };
}

// Fire-and-forget client-triggered push to the OTHER household members. Safe to
// call unconditionally after a mutation: the Edge Function derives the household
// from the caller, excludes the actor, and no-ops when there are no other devices.
// A failure here must never block the action that triggered it, so it swallows.
export async function sendPush(input: { title: string; body?: string; url?: string }) {
  try {
    const supabase = createClient();
    await supabase.functions.invoke("push-send", { body: input });
  } catch {
    /* best-effort */
  }
}
