# GameVault — PWA Ideas Backlog

Ideas surfaced while brainstorming PWA additions but not built in the first pass.

## Offline collection cache (IndexedDB)
Cache games + progress to IndexedDB on load so the vault is browsable with no signal.
Killer use case: barcode-scan at a physical store to check "do we already own this?"
offline. Queue progress edits while offline and flush on next launch (iOS has no
Background Sync API, so sync-on-open rather than true background sync).
Touches: src/lib/useVault.ts (read-through cache + write queue), public/sw.js.

## Scheduled reminders (needs pg_cron + a daily Edge Function)
- Release reminders: "<wishlisted game> releases tomorrow." Source = /api/upcoming + games.
- Challenge deadline reminders: "2 days left to finish your 5 games."
Both require a scheduled Edge Function (pg_cron) that reads household members'
push_subscriptions and sends — reuse the push-send function with a "reminders" mode.

## Database-webhook send model (alternative to client-triggered)
Server-authoritative delivery: Postgres triggers (pg_net) call the push Edge Function
on row changes, so notifications fire even if the actor's device is offline. More infra
(triggers, secret storage, pg_net) and harder to version than the client-triggered model
we shipped. Worth it if delivery reliability becomes a real problem.

## Share Target API (incoming share) — Android/desktop only, NOT iOS
Register the app as a manifest share_target so a store link shared from the browser opens
GameVault with the add-game form prefilled. Blocked on iOS Safari PWAs.

## App shortcuts (manifest `shortcuts`) — Android only
Long-press the icon → "Scan barcode", "Add game", "Achievements". Not supported on iOS.

## Periodic Background Sync — Android only, gated
Refresh upcoming releases / events overnight. Not supported on iOS.

## Incremental realtime updates (reduce DB request volume)
Today useVault.load() runs ~9 parallel queries (games, progress, profiles,
settings, playthroughs, challenges, members, unlocks, token count) and is called
on EVERY realtime change, for every connected device — so a single game INSERT
costs ~9 queries × each online household member, plus a full re-pull of the whole
vault (egress). It's simple but chatty, and it's the biggest lever on Supabase
request volume + egress as usage grows.

Fix: apply the realtime change payload to local state in place instead of
re-running load(). Each postgres_changes handler already receives the new/old row
(REPLICA IDENTITY FULL is on per 0016), so e.g. a games INSERT can append to the
games array, an UPDATE can patch the matching row, a DELETE can drop it — no
refetch. Keep load() only for the initial mount and the throttled foreground
backfill. This turns "1 change = ~9 queries × N clients" into "1 change = 0
queries" for the receivers.

Watch out for: keeping the client-side joins consistent (games carry a per-user
`progress` map + `playthroughs`), and ordering. Probably worth a small reducer
keyed by table. Biggest win for scale; do it before the free-tier egress / 200
concurrent realtime limits actually bite.

## Lower priority
- Fullscreen API for collection browsing on a TV/second screen.
- Gamepad API to navigate the collection / mark status with a controller.
