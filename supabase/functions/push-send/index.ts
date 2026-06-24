// push-send — client-triggered Web Push fan-out.
//
// The actor's own device calls this right after a mutation (game finished/added,
// challenge created, achievement unlocked) and it delivers a notification to the
// OTHER household members' devices. The actor is excluded, so nobody is notified
// of their own action. There is no scheduled/cron path here by design — time-based
// reminders are intentionally out of scope (see CLAUDE_IDEAS.md).
//
// SECURITY: the target household is derived from the caller's JWT via the service
// role — never from the request body — so a caller can only ever notify their own
// vault. `verify_jwt` (Supabase default) already rejects unauthenticated calls at
// the gateway; we re-resolve the user here to get their id.
//
// Secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:you@example.com)
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are auto-injected.
import { cors, json } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

// Clamp incoming strings — the payload is rendered verbatim in a system
// notification, so cap length and coerce non-strings away.
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    // Resolve the caller from their JWT.
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const payload = await req.json().catch(() => ({}));
    const title = str(payload?.title, 120);
    const body = str(payload?.body, 240);
    const url = str(payload?.url, 512) || "/";
    if (!title) return json({ error: "title required" }, 400);

    // Service role bypasses RLS so we can read every member's subscriptions.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Household comes from the caller's membership — NOT the request body.
    const { data: membership } = await admin
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const householdId = membership?.household_id;
    if (!householdId) return json({ sent: 0, pruned: 0 });

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("household_id", householdId)
      .neq("profile_id", user.id); // never notify the actor

    console.log("push-send invoked", { caller: user.id, householdId, recipients: subs?.length ?? 0 });

    const notification = JSON.stringify({ title, body, url });
    const dead: string[] = [];
    let sent = 0;

    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          notification,
        );
        sent++;
      } catch (e) {
        // 404/410 = the endpoint is gone (unsubscribed / uninstalled). Prune it so
        // the table doesn't accumulate dead devices. Log every failure so a bad
        // VAPID match / malformed key (other status codes) is visible.
        const code = (e as { statusCode?: number })?.statusCode;
        console.error("push send failed", { code, message: String(e) });
        if (code === 404 || code === 410) dead.push(s.id);
      }
    }));

    if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
    console.log("push-send result", { sent, pruned: dead.length });
    return json({ sent, pruned: dead.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
