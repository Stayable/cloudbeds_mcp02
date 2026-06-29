# Cloudbeds MCP — TODO

## ACTIVE: TTLock ↔ Cloudbeds Middleware + Lock App (2026-06-12)
Spec: `docs/superpowers/specs/2026-06-12-ttlock-cloudbeds-middleware-design.md`

RESUME HERE (2026-06-29 EOD) — Branch tip **6c71640**, all committed+pushed (origin even). Big day; lots shipped + a hard live-debug of room-change.
⭐ NEXT (do first): **Register the accommodation webhooks** — `cd middleware && npx tsx scripts/register-accommodation-webhooks.ts` (dry run) then `--apply`. Run in a NORMAL terminal (not Claude sandbox — CB blocked here). If `--apply` 403s → key needs Webhooks/Notifications scope. This is THE fix for room-change reliability (see ROOT CAUSE below). BK hit "consistent errors" trying earlier — debug those (likely key scope or the script's env/endpoint-URL discovery).
ROOM-CHANGE ROOT CAUSE (confirmed live 2026-06-29): code logic is CORRECT (238→239 move worked end-to-end via cron). The blocker is **Cloudbeds read-API lag on room moves — and it's PER-KEY**: the middleware + lock-app use SEPARATE CB keys, and CB propagates a room change to them at different speeds (lock-app key showed 238 while middleware key still returned 239 for 10+ min → reconcile correctly saw "no change"). Polling (cron/resync) CANNOT beat this. The accommodation **webhook** sidesteps it: its payload carries roomId/roomIdPrev, and `reconcilePasscodes`→`reconcileDesiredRooms` already uses those hints, so the move happens from the EVENT, not a laggy getReservation read → instant + lag-immune.
VERIFY-LATER (sandbox can't reach CB/Vercel): CRON_SECRET added to BOTH lock-app + lock-middleware in Vercel (BK) — confirm a redeploy picked it up. */5 cron confirmed firing (Settings→Cron, last runs every 5 min). Grace currently **0/0** (BK set for testing — revert to 10/10 or final values after).
SHIPPED 2026-06-29 (all pushed; lock-app + lock-middleware ARE Git-connected, auto-deploy confirmed):
  • Cron */5 (Pro) + Lever-1 (reconcile skips lockless properties; ?propertyId= test filter).
  • Dup-PIN guard: unique `Passcode.activeKey` (one active guest code per res+room; P2002→delete orphan).
  • Grace period FULLY WIRED + configurable (Settings→Access timing, settings.manage): checkout/transfer
    grace via changePasscodePeriod→status "expiring"; sweepExpiredPasscodes in cron; isCheckout gate.
  • Expired-code fix: validity window padded +5h (EASTERN_END_PAD_MS) so codes cover the FL local checkout day.
  • Resend-code button (room detail): re-issues guest code w/ fresh window + reposts note; added post()+
    postReservationNote() to lock-app CB client.
  • EMAIL_FROM → "Stayable Locks <admin@rentstayable.com>" (senderFrom wraps bare addr; BK set Vercel env).
  • Dashboard→room back-link returns to Dashboard (?from=dashboard).
  • Settings "Saved ✓" confirmation (useFormState).
  • Live AUTO-REFRESH: /api/state-version (cheap DB signature) + <AutoRefresh> polls 12s, router.refresh()
    only on change (no CB calls steady-state; PAUSES when tab hidden → that's why a manual refresh was needed
    when the tab was backgrounded). On dashboard + room detail.
  • Reconcile move-detection hardened twice: re-fetch getReservation for coded reservations (ba07270) +
    handle coded reservations ABSENT from the checked-in list (6c71640). Logic verified; gated only by CB read-lag.
  • Debug probe: GET /api/debug/reservation?propertyId=&reservationId= (session-gated) → status + extractedRooms
    + raw room shapes. Uses the LOCK-APP CB key (note: middleware key can read differently — that's the per-key lag).
LOOSE ENDS / FOLLOW-UPS:
  - Harden **Sync Occupancy** the same way as the reconcile (it has a stale-room blind spot: only falls back to
    getReservation when the list row is EMPTY, so a stale non-empty room keeps the green wrong). lock-app occupancy-sync.ts.
  - Earlier backlog still open: 5-backup-PINs (DONE earlier), Resend templates (Resend email send not wired),
    SMS (Twilio, on hold), User Logs page, verify users in prod.
  - Temp/debug: /api/debug/reservation is a live debug route — fine to keep, or remove later.

Status: **spec APPROVED. Phases 2+3 built; webhook built (Phase 4). TTLock auth
VALIDATED LIVE. lock-app Plans 2+3 DONE + property-first restructure DONE (OTP login,
Portfolio→Dashboard flow, property sidebar, top-bar profile + notification bell).**
RESUME HERE (2026-06-28 PM) — **Room-change reconciliation BUILT + big lock-app UI/occupancy pass. All committed+pushed (origin even); auto-deploys live.** Branch tip: 72675a0.
GATING THE ROOM-CHANGE TEST (do in order):
  1. ⭐🔴 **Gerardo: get the 239 lock (Cloudbeds roomID 405761-25) onto a TTLock gateway / online.** It's
     disconnected → TTLock errcode **-2012 "not connected to any Gateway"** → PIN create fails there. (405761-40
     works, has gateway.) Verify on Devices: 405761-25 should flip from offline once reachable.
  2. 🟡 **Register the accommodation webhooks** (instant room-change path): from `middleware/`, run
     `npx tsx scripts/register-accommodation-webhooks.ts` (LIST — done, confirmed API) then `--apply`. Script
     auto-reads lock-app/.env.cloudbeds.local + reuses each account's existing endpointUrl.
  3. 🟡 **Test the move**: change a reservation's room in Cloudbeds → event log should show
     `passcode_revoked (room_change)` on old room + `passcode_created` on new. (Or trigger now without webhook:
     `curl -H "Authorization: Bearer <CRON_SECRET>" https://lock-middleware.vercel.app/api/cron/reconcile`.)
KEY FINDINGS this session:
  • **Room change fires NO subscribed webhook** for these accounts — only `status_changed` is ever received.
    `accommodation_changed`/`removed` are NOT subscribed → never reach us. (Built handler + poll-cron + reg script.)
  • **Only Lakeland (210972) has ANY webhooks** (status_changed + deleted). Other 7 properties have ZERO — not
    wired for anything yet (separate rollout). getWebhooks shape = `event.{entity,action}` + `subscriptionData.url`;
    owner = the per-property api_client. Receiver URL = `https://lock-middleware.vercel.app/api/cloudbeds-webhook?token=0e2ee408…`.
  • **Vercel Hobby blocks sub-daily crons** → froze lock-app deploys 45 min until cron set DAILY. Both crons
    (occupancy `0 4 * * *`, reconcile `0 5 * * *`) are DAILY until the team is on **Pro** (then bump to ~every few min).
  • **MCP server (cloudbeds-mcp02) keys still all revoked** — the Cloudbeds MCP tools in-session are dead; refresh
    those env vars + redeploy if MCP needed. (lock-app + middleware keys are fine.)
  • Resend $20/mo approved (per BK; not logged).
SHIPPED this session (all deployed via Git auto-deploy — lock-app is now Git-connected, Root Dir `lock-app`):
  LOCK-APP: full-inventory Rooms list (Cloudbeds getRooms union, "No lock assigned" pill+filter); Portfolio
  small status SQUARES (occupancy-first colors + lock-fault ring) + mini status-count cards, whole card → Dashboard;
  Dashboard "All rooms" numbered heatmap (clickable) + "Needs attention" ACCORDION below it + room-NUMBER labels
  (was roomID) + dropped dead "View all→alerts"; heatmap colors = black no-lock / grey vacant / green-orange-red
  occupied-by-health / **light-blue (#38BDF8) "occupied · no lock installed"**; **Occupancy rehydrate**: "Sync
  occupancy" button (Portfolio all + Dashboard per-prop) + daily cron + `lib/occupancy-sync.ts` (rate-limit-safe:
  sequential + includeGuestsDetails + retry); full-screen **loading overlay**; **MOVE-A-LOCK flow**: unmap renames
  lock → `<ABBR> (unassigned)` + pools it (sticky — discovery won't re-grab), room-page **assign-lock dropdown**,
  Devices revamp (all locks incl. available, Lock Name + **TTLock-name** cols, filter/sort, clickable) + new
  **/devices/[lockId]** lock-detail (status + assign-room dropdown), shared `app/(app)/lock-actions.ts`; Unassigned
  defaults property from lock name; `<ABBR> <lockId>` labels.
  MIDDLEWARE: **room-change reconciliation** (`reconcilePasscodes` for accommodation_changed/removed — revoke old
  room PIN, create new, move occupancy; classifyIntent "reconcile" + dual payload casing); **poll-reconcile cron**
  `/api/cron/reconcile` (catch-up, no webhook needed); **un-check-in revokes** the code (checked_in→confirmed);
  **4-digit PINs** (was 6, future codes only); **occupancy freed by currentReservationId** independent of passcode
  (fixed rooms stuck green); **PIN-create failure handler** → posts Cloudbeds note + marks lock **offline** (red +
  Needs-attention) on -2012 + skips retries, success → online=true; **webhook reg script**.
DEFERRED (BK said later): lock-health poll cron (idle-lock online/battery — "Plan 4"); reservation-note
  "replace not append" on room-change (new note posts, old lingers — PIN IS revoked, cosmetic); set CRON_SECRET on
  both Vercel projects (cron auth + manual trigger); roll out webhooks to the other 7 properties.

NEW BACKLOG (2026-06-28 PM, from BK):
- [x] ⭐ **Stay EXTENSION keeps the SAME code + window now extends** (DONE 2026-06-29). createPasscodeForRoom's
      idempotency guard now: if an active PIN exists for (reservation,room), keep the digits but — when the
      reservation dates moved — call TTLock `keyboardPwd/changePeriod` (new `changePasscodePeriod` in BOTH
      ttlock.ts clients, changeType=2) + update Passcode.startTs/endTs, log `passcode_period_changed`. Offline
      lock → mark offline + `passcode_period_change_failed`, don't throw (poll cron / next event retries). Pure
      decision `passcodeWindowChanged` in reservation-intent.ts (TDD). The daily reconcile cron ALSO refreshes
      windows (it calls the same helper) — covers the case where a Cloudbeds date-extension fires no event we get.
- [x] **Backup codes: 5 per lock, each independently rotatable** + label renamed "Staff backup PIN" → **"Backup
      PINs (offline)"** (DONE 2026-06-29). Added `Passcode.backupSlot Int?` (both schemas, pushed to Neon).
      splitCodes returns `backups: (CodeRow|null)[]` length BACKUP_SLOTS=5 (legacy null slot → slot 1) (TDD).
      reveal/rotateBackupCode now take a `slot`; room detail renders 5 slot rows each with its own Reveal +
      Rotate/Create. Files: door-detail.ts, actions.ts, room detail page.tsx.
- [x] **Reveal actions excluded from the notification bell** (DONE 2026-06-29). New `isBellEvent(action,outcome)`
      in notifications.ts = alert AND not a reveal; TopBar bell filter uses it. Reveals still appear in the
      Activity log (amber) — only the bell is filtered. (TDD.)
NOT YET DEPLOYED — committed? no. Push to deploy (lock-app + middleware are Git-connected → auto-deploy).

GATEWAY STATUS + GRACEFUL ERRORS (DONE 2026-06-29, spec
docs/superpowers/specs/2026-06-29-lock-app-gateway-status-and-graceful-errors-design.md):
- PART B (graceful errors): server actions now return `ActionResult` instead of throwing
  (action-result.ts + mapActionError, -2012→friendly gateway text, TDD). Client `<ActionButton>`
  (pending-disabled → kills the lock-238 rotate double-submit race) + `<ActionForm>` + centered
  dismissible `<ActionError>` modal; RevealButton + RoomAssignForm on same contract; `(app)/error.tsx`
  boundary. Fixes the 239 gateway-offline CRASH ("server-side exception / Digest"), the 238 race, and
  the stuck-on-back behavior. Files: components/{ActionButton,ActionForm,ActionError}.tsx, lib/action-result.ts,
  rooms/[roomId]/{actions.ts,page.tsx,RevealButton.tsx}, lock-actions.ts, devices/[lockId]/RoomAssignForm.tsx.
- PART A (gateway status): new `Gateway` model + `UnassignedLock.gatewayId` (lock-app schema, pushed to
  Neon). ttlock.ts gained `listGateways`+`listLocksForGateway` (both clients). `gateway-sync.ts` folded into
  the existing discovery Sync action (runs AFTER lock sync; infers each gateway's property from served locks
  via `inferGatewayProperty`, TDD; sets LockMap/UnassignedLock.gatewayId; stale-cleanup guarded vs empty
  response). Devices page Gateways section; new `/devices/gateways/[gatewayId]` detail page (status + served
  locks); lock-detail + room-detail cards show the connected gateway (name+status) linked. gateway-view.ts.
- VERIFY LIVE (sandbox can't reach TTLock): run Sync → gateways populate; open Lakeland 239 → "not connected"
  + generating a code shows the friendly modal, no crash; lock 238 → rapid rotate locks the button.

ROOM-CHANGE AUTO PLAN (2026-06-30):
- Webhook does NOT fire on a pure room change for these accounts → caught only by the poll-reconcile cron
  (/api/cron/reconcile → reconcileCheckedInReservations). Cron is DAILY on Hobby; needs Vercel PRO ($20/mo,
  BK requesting from Rob) to run sub-daily. Fastest Vercel cron = */1 (every minute). **BK DECISION: */5 min**
  (safe even at full deploy — reconcile is ~2-3 Cloudbeds calls/property/run, rooms inline, steady-state
  zero TTLock/CB-write calls; 8 properties = 8 independent 5-req/sec budgets; DB upserts scale w/ occupancy
  but trivial for Neon). Manual-button idea DROPPED (a room change at 2am with nobody watching needs auto).
- LEVER 1 DONE (2026-06-30): cron now skips properties with no mapped locks (pure propertiesToReconcile,
  TDD) → today only Lakeland is polled (1 Cloudbeds call/run vs 8). Added ?propertyId= filter for single-prop
  tests. Files: middleware/lib/reservation-intent.ts + app/api/cron/reconcile/route.ts. Steady-state cost =
  ~1 getReservations/property/run (rooms inline; no PIN change → DB-only after).
- ON PRO (do in order): (1) set CRON_SECRET on lock-middleware; (2) bump vercel.json cron to `*/5 * * * *`
  (NOT before Pro — Hobby rejects sub-daily crons and freezes the deploy); (3) run
  register-accommodation-webhooks.ts --apply + verify the event actually delivers — if it does, relax the cron
  to ~30 min (event-driven primary + cron backstop, near-zero API load).
- [x] DUPLICATE-PIN GUARD DONE 2026-06-30. Used a nullable UNIQUE `Passcode.activeKey` ("<resId>:<roomId>"
      while active, null on revoke/expire) instead of a partial index — Prisma-native so db push preserves it,
      no long txn, Postgres allows many NULLs (manual/backup/expiring stay null). Both schemas + pushed to Neon
      (prod had 0 active guest codes → clean add). createPasscodeForRoom sets activeKey + catches P2002 →
      deletes the orphan TTLock code + logs `passcode_create_deduped` + returns (lost race, benign). All revoke
      paths null activeKey (revokePasscodes, both reconcile loops, lock-app revokeGuestCode). activeKeyFor helper
      (TDD). Grace-compatible: an `expiring` code = activeKey null, so it never blocks the new active code.
- [x] CRON */5 LIVE 2026-06-30 (Pro) — vercel.json bumped, middleware auto-deployed.

- [x] CODE-EXPIRED BUG FIX + RESEND BUTTON (2026-06-30). ROOT CAUSE: validity window ended at departure
      23:59:59 **UTC** = ~7:59pm Eastern, so codes read expired in the checkout-day evening (and a same-day
      stay looked expired the instant it was issued). FIX: pad the window end by EASTERN_END_PAD_MS (+5h) in
      BOTH window fns (lock-app guestValidityWindow + middleware validityWindow) → covers the full Florida
      local checkout day (TDD). NOTE: next reconcile auto-extends existing codes' windows via the
      window-change path. RESEND BUTTON: room detail guest card "Resend code (new PIN)" (guest_code.generate_manual,
      occupied rooms) → resendGuestCode action: clears any guest code, issues a FRESH one with the corrected
      window, re-posts <lock>-<PIN> note to Cloudbeds, shows the new PIN (RevealButton). Added post()+
      postReservationNote() to the lock-app Cloudbeds client (was read-only; keys have Reservation R+W).
      EMAIL_FROM default → admin@rentstayable.com (BK set the Vercel env too).
- [ ] STILL OPEN: confirm the "expired" repro is fixed on retest (BK retesting). If a guest still sees expired,
      capture where (lock keypad vs app) + reservation dates — may need a true property-timezone window, not the
      +5h pad. Also confirm lock-middleware is Git-connected (deploys from pushes) — was unverified.

NEW BACKLOG (2026-06-30, from BK — captured, NOT yet built):
- [x] ⭐ GRACE PERIOD / revoke-delay FULLY WIRED 2026-06-30, SET TO 10m BOTH (checkout + transfer; prod
      AppSettings row upserted to 10/10). Mechanism: revokeOrExpire() — grace>0 shortens the PIN's TTLock
      window to now+grace via changePasscodePeriod + marks it status="expiring" (activeKey nulled, room freed
      immediately); grace=0 = delete now (unchanged). sweepExpiredPasscodes() in the /5 cron hard-deletes +
      revokes expiring codes past their window. Checkout grace fires on status checked_out only (isCheckout,
      TDD); cancel/no-show/deleted + un-check-in = immediate. Room-transfer grace fires in both reconcile revoke
      loops (webhook + cron). AppSettings added to MIDDLEWARE schema (reads via getGraceSettings, fallback 0).
      lock-app door-detail treats "expiring" as not-the-active-code (shows in history; TDD). NO safety rule
      (per BK) — during a checkout/transfer grace window the old code still works even if a new guest checks into
      that room; revisit if turnover ever overlaps <10m.
- [x] TEST re-sync button SHIPPED 2026-06-30 (per-property DASHBOARD, lock.sync-gated, labeled TEST): calls the
      middleware /api/cron/reconcile?propertyId= on demand so a room change is picked up now without waiting for
      the (daily-on-Hobby) cron. room-sync-actions.ts + RoomChangeSyncButton.tsx. Becomes redundant once the */5
      cron is live on Pro. Uses MIDDLEWARE_URL env (default prod) + CRON_SECRET bearer when set.
- [ ] ⭐ GRACE PERIOD behavior wiring — see above (the [~] item). [original capture:]
      On checkout/room-transfer, DON'T hard-delete the guest PIN — shorten its expiry to now+N min via
      changePasscodePeriod (already built); TTLock auto-expires it, the /5 cron finalizes DB cleanup. Two cases:
      #1 checkout headroom (guest still grabbing things → no attendant call), #2 room-transfer headroom.
      DESIGN Qs (brainstorm before building): separate delays for checkout vs transfer? per-property or global?
      default value? CAVEAT: checkout grace = departing guest's code still works during turnover → cap SHORT
      (15-30 min, hard max ~60) and SKIP the grace if the room gets a new check-in (double-access risk);
      transfer grace has no such risk (can be more generous). Files: lock-app Settings UI + setting model +
      middleware checkout/transfer revoke paths (revokePasscodes / reconcile).
- [ ] RESEND email templates (BK creating): (a) "door code ready" for NEW guests, (b) "new door code" on
      ROOM CHANGE. Wire sending into the middleware create path (postReservationNote already fires; add email
      send via lib/email.ts Resend). Design brief exists: claude-design-guest-code-notification.md. Needs guest
      email (we already fetch it via getGuest for the guest-details card). Gate so it only sends once per code.
- [ ] SMS integration for automated guest messages (door codes + info). RECOMMENDATION: Twilio (primary —
      reliability + best Node/Vercel SDK); Telnyx/Plivo cheaper alternatives. ⚠️ US business SMS requires A2P
      10DLC brand+campaign registration (few-days lead time + small fee) — START EARLY, it's the long pole.
      Resend is email-only so SMS is a separate provider. Mirror the email template set (code-ready, room-change).
- [ ] **User Logs** — a view of actions taken within the dashboards, per user (EventLog already stores
      actorUserId/actorEmail/actorRole). CLARIFY w/ BK: dedicated "User Logs" page vs a user filter on the existing
      Activity page.
- [ ] **Add/verify users**: kate@rentstayable.com, gerardo@rentstayable.com, rb@rise8companies.com. NOTE: likely
      ALREADY seeded (seed-users.ts has rb@rise8 + kate@rentstayable; gerardo added prior as super_admin). Verify
      present in prod Neon; add any missing via seed-users.ts + `npm run db:seed:users` (confirm role per user —
      super_admin vs scoped; gerardo may want field/on-site scope not super_admin).
--- earlier 2026-06-28 ---
RESUME HERE (2026-06-28) — **Guest-details card SHIPPED + all 8 Cloudbeds keys live on lock-app + custom domain added.**
This session:
• ✅ **Guest details card on room detail page** (spec+plan+subagent-driven build, commits 0a6d04f..f1dd341,
  pushed + deployed prod). Live-fetches name/email/phone/room#/lease-start/end from Cloudbeds when a room is
  occupied (getReservation + getGuest), pure `toGuestDetails` mapper, try/catch loader that NEVER breaks the
  page, graceful "contact unavailable" fallback when no key/error. Visible to rooms.view. 106/106 tests.
  Final opus review caught + fixed: defensive Cloudbeds field names (guestEmail/guestPhone/guestCellPhone +
  legacy), AbortSignal.timeout(6000) on client fetch, cellPhone-over-landline precedence.
  Files: lock-app/src/lib/{guest-details,guest-loader}.ts + cloudbeds.ts (getReservation/getGuest) + room
  detail page.tsx. Spec: docs/superpowers/specs/2026-06-27-lock-app-guest-details-design.md. Plan:
  docs/superpowers/plans/2026-06-27-lock-app-guest-details.md.
• ✅ **All 8 per-property Cloudbeds keys added to lock-app Vercel** (Preview+Production) → every property's
  room dropdown + guest card now works. Keys also in lock-app/.env.cloudbeds.local (GITIGNORED) +
  .env.example documents the slots. Uniform 4-scope keys: Room R, Reservation R+W, Guest R.
• ✅ **Lakeland key regenerated/rotated** (uniform scopes) → updated in BOTH lock-middleware + lock-app +
  local; redeployed both. Knocks out the old "rotate Lakeland cbat_ key" todo.
• ✅ Custom domain **lock.rentstayable.com** added to lock-app (SSL generating — completes on DNS validate;
  domain managed outside this Vercel team so `vercel domains inspect` 403s — harmless, attached as alias).
⭐ VERIFY LIVE NEXT SESSION (sandbox can't reach Cloudbeds): open occupied **Lakeland Room 239** on the
  deployed app → confirm Guest card shows email+phone (not "—"). If empty but guest has them in CB, capture
  the real getGuest response shape + adjust field mapping. Also test the assign-room DROPDOWN end-to-end.
--- earlier 2026-06-27 ---
RESUME (2026-06-27 PM) — **Assign-room is now a Cloudbeds ROOM DROPDOWN (no free text).**
• ✅ Unassigned-queue assign: room is now a cascading dropdown of the property's REAL Cloudbeds
  rooms (`/api/rooms?propertyId=`), value = roomID → matched automatically; can't pick a room that
  doesn't exist. Property-first, then rooms load. No key → select disabled w/ "add CLOUDBEDS_API_KEY_<id>"
  notice (dropdown-only per BK). New `AssignForm.tsx` (client, cascade) + `/api/rooms` route. Server
  action now takes `roomId`, re-derives the room# authoritatively via `resolveNameFromId` (rejects
  forged/stale ids), then renames lock to `<ABBR>-<room>` + maps. resolver gained `byId` index
  (+4 tests). 100/100 tests, typecheck + build green. Renaming = the assign action, so it's covered
  by the same rule. NOT YET DEPLOYED (vercel --prod from lock-app/) + needs the read keys live.
--- earlier 2026-06-27 ---
RESUME (2026-06-27) — **Resolver SHIPPED + checkout→revoke verified live; 2 locks mapped at Lakeland.**
This session:
• ✅ **Full check-in cycle PROVEN LIVE** (event log): passcode_created → reservation_note_posted →
  code_revealed → **passcode_revoked on checkout** (res 3435425699816). The "untested checkout→revoke"
  item is DONE. Webhook is actively receiving real Lakeland check-ins (3 real guests hit no_lock_mapped).
• ✅ **Room-name → Cloudbeds-roomID RESOLVER built** (commit 1365b16): `lock-app/src/lib/room-resolver.ts`
  (pure index + RoomIndexCache, 5 tests) + `cloudbeds.ts` (read-only client/registry + listRooms).
  Sync + unassigned-assign now resolve room#→Cloudbeds roomID; **Sync no longer clobbers** good maps
  (refuses to overwrite when unresolved). Assign errors loudly if no key / unknown room. Added
  `LockMap.roomName` (pushed to Neon); dashboard actions show room NUMBER not roomID. 96/96 tests, build green.
• ✅ Discovered roomID format = `<roomTypeID>-<seq>` (Lakeland: 405758=Double,405759=King,405761=DblStudio,
  405763=KingStudio,405768=Single); room# lives in roomName, NOT derivable — must list_rooms.
• ✅ **Two locks mapped at Lakeland** (hand-corrected this session): lock 27083179→405761-25 (Room 239),
  lock 25039233 "test -not installed"→405758-102 (Room 292). Both have roomName backfilled.
• ✅ Gerardo login added (super_admin); `users.view` permission (admin manages, others view).
• ✅ Fixed lock-app Vercel missing TTLOCK_* env (Sync button now works); root cause of redeploy-not-applying
  = dashboard redeploy clones old env snapshot → must `vercel --prod` fresh from lock-app/.
• ✅ Specs: room-change reconciliation (Approach B, accommodation_changed→revoke old+create new) + full
  baseline flow + **note must be REPLACED not appended** on room-change/regen (open Q: custom field vs notes).
• ✅ Design brief `claude-design-guest-code-notification.md` (guest "door code ready" email/SMS template).
TO MAKE RESOLVER LIVE (next): (1) `vercel --prod` from lock-app/ to deploy resolver+display; (2) add
**CLOUDBEDS_API_KEY_<id> (read scope)** to the lock-app Vercel project (it has NONE; middleware has them).
Without keys Sync reports "unresolved" but is now SAFE (won't clobber).
READY TO TEST NOW: #1 check-in→code on Room 239 or 292 (runs via middleware, mappings correct).
NOT BUILT: #2 room change (needs room-change reconciliation built); guest-code delivery (template only,
sending not wired); gateway-status feature (designed, not built); Plan 4 sync cron (deferred, manual button OK).
--- prior ---
RESUME HERE (2026-06-25 FINAL) — ✅ **Lakeland check-in flow WORKS end-to-end (verified live).**
Check-in (in-house) + balance 0 → middleware created guest PIN **794490** on lock 27083179 +
posted reservation note **`LL-239-794490`** + set room 239 occupied. The "DB mismatch" was a
FALSE ALARM (one shared Neon all along). Real root-cause bug fixed: **extractRoomIds** now reads
`assigned[]`/`guestList[].rooms[]`, not just top-level `rooms[]` (which was always empty → no PIN).
Also: check-in detected from webhook payload `status:checked_in` (+ fetched status/guestStatus
fallback + read-retry for webhook lag); payment gate (balance 0). Diagnostics removed; throwaway
scripts + register-webhooks ps1 (had secrets) deleted. Gerardo to test checkout→revoke. Note
author shows BK's account (Cloudbeds stamps the key owner; no author param) — TEMPORARY, OK.
**TOMORROW (per BK):**
1. ⭐ **REMINDER BK ASKED FOR:** build **room-name → Cloudbeds roomID resolution** in the
   Unassigned-queue *assign* — it currently maps `roomId` = the typed room ("239"), but check-in
   matches the Cloudbeds roomID ("405761-25"). Until resolved, onboarding-assigned locks won't
   drive check-in PINs. Onboarding↔check-in consistency fix.
2. **Rotate** Lakeland `cbat_` key + `WEBHOOK_SECRET` (both pasted in chat) → re-register the 2 webhooks.
3. **Roll out the other 7 properties:** per-property `cbat_` key (Reservations read+write) + register
   `status_changed` + `deleted` webhooks → same `/api/cloudbeds-webhook?token=<WEBHOOK_SECRET>`.
Branch many commits ahead of origin, NOT pushed. Team updated on progress.
SERVICE ACCOUNT (deferred): dedicated Cloudbeds user "Stayable Lock App" so notes aren't BK's.
--- prior (now-resolved) detail below ---
RESUME HERE (2026-06-25 LATE) — **Lakeland check-in trial fully wired; BLOCKED on a Neon
DB mismatch (fix first, ~5 min).** This session shipped a LOT (18 commits, all to prod):
• **Full lock-app visual redesign** ported from the Claude-design mockup
  (`lock-app/Stayable Lock App/`): new `globals.css` design system (navy/blue #1E8FF2/gold,
  dark shell), Space Grotesk + IBM Plex Sans/Mono via next/font, brand assets in
  `public/brand`, persistent global sidebar + restyled topbar, and ALL screens ported
  (split-screen login, portfolio "fleet heartbeat" cards, dashboard, rooms, room detail
  w/ navy PIN block, devices, unassigned, activity, alerts). 87 tests pass. Deployed prod
  (lock-app-dusky). DEMO DATA cleared from Neon + demo-strip removed.
• **Lock auto-onboarding** (spec `docs/superpowers/specs/2026-06-25-lock-auto-onboarding-design.md`):
  discovery sync + `<ABBR>-<room>` naming (KE/KW/OR/LL/JN/JW/SA/DV on PROPERTIES.abbr) +
  Unassigned queue + assign=rename-in-TTLock+map; assign room# auto-prefilled from lock name.
• **Middleware on check-in** now: creates PIN + posts reservation note **`LL-239-<PIN>`** +
  writes RoomState (occupancy/guest, clears on checkout) + **gates on paid-in-full
  (balance 0)**; trigger = **check-in only**. Pure logic in `lib/reservation-intent.ts`
  (classifyIntent/reservationNoteBody/isPaidInFull, vitest). Deployed prod.
• Trial set up: lock **27083179** mapped to Lakeland(**210972**)/roomId **405761-25** alias
  **LL-239**; lock renamed in TTLock; **2 webhooks registered** (status_changed + deleted on
  210972 → lock-middleware.vercel.app/api/cloudbeds-webhook?token=<secret>); reservation
  **3435425699816** balance zeroed ($0). Gerardo also has a manual permanent code on the lock
  ("contractors" 9735) — our codes are additive, never overwrite his.
**BLOCKER (do FIRST):** test check-in (status→in-house) fired the webhook (HTTP 200) but
wrote ZERO rows to lock-app's Neon → **lock-middleware prod `DATABASE_URL` ≠ lock-app's**
(Vercel provisions a separate Neon per project). FIX: copy `DATABASE_URL` +
`DATABASE_URL_UNPOOLED` from the **lock-app** Vercel project into **lock-middleware** (host
must be `ep-nameless-sound-atep4iwp…neon.tech`), redeploy middleware. THEN revert res to
confirmed → set in-house again → read shared eventLog (via lock-app/.env scripts) → likely
Cloudbeds sends status **`in_house` NOT `checked_in`** → update ACTIVE_STATUSES in
`middleware/lib/reservation-intent.ts` + redeploy. (Memory: lock-trial-blocker-db-mismatch.)
LOOSE ENDS: rotate Lakeland `cbat_` key + `WEBHOOK_SECRET` (both pasted in chat); delete
`register-webhooks-lakeland.ps1` + untracked one-off scripts `lock-app/prisma/{add-trial-lock,
unmap-trial-lock,map-lakeland-trial,check-trial-state,all-events,clear-demo-data}.ts`;
`lock-app/Stayable Lock App/` + `.zip` mockup are untracked (assets already copied to
public/brand — safe to delete); root `.vercel/` is an untracked link to lock-middleware.
Cloudbeds MCP `.env` key was swapped → /mcp reconnect picks it up (done this session).
--- earlier 2026-06-25 ---
PRIOR (2026-06-25): **4 login accounts added + redeployed** (earlier this session).
Added `prisma/seed-users.ts` + `npm run db:seed:users` → upserts rb@rise8companies.com,
admin@rentstayable.com, bke@rentstayable.com, kate@rentstayable.com as **super_admin / all**
(OTP only mints for emails in the User table, so a row = login access). Ran against prod
Neon; committed a269fc6; redeployed lock-app to prod (Ready, dpl …lock-bf9qyuaf1).
OPEN: 3 placeholder display names (Rob/Admin/Kate) — get real names, re-run seed (no
redeploy needed). NOTE: Vercel CLI deploy worked from sandbox this session (the documented
api.vercel.com block didn't bite). Earlier 2026-06-25 work below:
PRIOR (2026-06-25): **OTP email + portfolio redesign + demo data shipped.**
This session: (1) **OTP login now emails the code via Resend** — `lib/email.ts`
(`buildOtpEmail` pure + Stayable-branded, `sendOtpEmail` via Resend REST API, no
SMTP/SDK dep); `createOtp` emails + falls back to console log on failure; 5 new
tests (70/70 pass). Prod env set: `RESEND_API_KEY` (user-added) + `EMAIL_FROM`=
`Stayable Locks <hr@rise8companies.com>`. **Sender domain rise8companies.com must
be DNS-verified in Resend or sends fail** — confirm live (send a code to
bke@rise8companies.com, check inbox vs runtime logs). (2) **Portfolio redesigned**:
`globals.css` got a full design system (canvas bg, type scale restored after
Tailwind preflight, eyebrows, tabular-nums, status rails) — lifts EVERY page off
raw HTML; portfolio is now a **4-col wrapping card grid** (4/3/2/1 responsive) of
property status panels (left rail green/red by health, gold hover hairline).
(3) **Demo data across all 8 properties**: `seed-dev.ts` rewritten — 101 test
locks (Lakeland/KissimmeeEast keep hand-crafted lock-388 door-detail demo; other
6 generated), seeded into shared Neon. App-wide **DEMO DATA strip** under the top
bar (placeholders until live TTLock locks register). Deployed to prod 3×
(latest dpl_…c1get26xd). 3 commits: bc6e3b6, b286080, 314b4fd.
NEXT: carry the new styling into dashboard/rooms/devices/activity pages (they have
data now but still use sparse inline styles); verify Resend domain + live OTP email;
then Plan 4 (alerts engine) or Plan 5 remainder.
---
PRIOR (2026-06-23): **Property-first restructure COMPLETE** (8-task plan,
`docs/superpowers/plans/2026-06-23-lock-app-property-first-restructure.md`). Shipped:
email-**OTP** login (6-digit code, replaces magic-link; code logged to console till
email delivery ships), **Portfolio** picker landing (`/portfolio`) → per-property
**Dashboard** (`/p/[id]/dashboard`, KPIs + "My Actions" feed, no zones), property-scoped
**flat sidebar** (Dashboard/Alerts/Rooms/Devices/Activity + ← Portfolio; Settings/Users
pinned bottom), **top bar** with profile menu (name/notification prefs/sign out; password
deferred) + in-app **notification bell** (unseen count from EventLog warning/failed;
delivery deferred to Alerts engine). Login white-on-white input bug fixed. 3 new pure
libs TDD (otp/dashboard/notifications); **65/65 tests pass**, typecheck+build green.
Smoke-tested live: OTP login → portfolio → dashboard renders seeded actions. Removed
unused PropertySwitcher. 9 commits this session.
REFERENCE (2026-06-23): `lock-app/DeviceThread/` = 6 PNG screenshots of the legacy
DeviceThread/SmartAccess UI (the system we're replacing), kept as design source of truth:
Dashboard(+Sidebar), Alert, Reports, SmartAccess_AccessSchedule, SmartAccess_Guests.
Alert.png → maps to Plan 4 (alerts engine); SmartAccess_Guests → guest code surfaces.
Currently UNTRACKED — decide whether to commit (e.g. lock-app/docs/legacy-ui/) or leave.
NEXT SESSION — pick one: (1) **Plan 4** = alerts engine + crons (turns the bell real:
detection jobs + email delivery + notification-pref enforcement); (2) **create the
lock-app Vercel project** (Root Dir `lock-app/`, shared Neon `DATABASE_URL`) to deploy;
(3) **Plan 5 remainder** = Users/Roles/Settings UI + real OTP email (reuse client-portal
email.ts) + optional password auth.
Still LIVE-UNVERIFIED (blocks E2E, not dev): TTLock write paths need a registered lock
+ reachable `euapi.ttlock.com`; webhook needs a real Cloudbeds sample. Branch is 41
commits ahead of origin — NOT pushed.
TTLock auth root cause (reference): OAuth grant uses the lock-owning `lock2.ttlock.com`
account password, NOT the `euopen.ttlock.com` portal pw; API host `euapi.ttlock.com`.
Confirming `4ec9049d…` = `main` still needs Gerardo to register 1 test lock.
SECRET HYGIENE: `WebStayable123$` (euopen pw) + client_secret surfaced in chat; the
working lock2 pw stayed in gitignored `ttlock-test.ps1` only. Delete that file + rotate
when convenient.
Legend: 🟢 ready now · 🟡 needs an input · 🔴 blocked on Gerardo/on-site · P0 = critical path

### Phase 0 — Prereqs
- [~] 🔴 P0 Verify `client_id 4ec9049d…` is the **`main`** app — auth confirmed, but
      `lockCount:0` (no locks yet) so main-vs-old is UNVERIFIABLE until a lock is
      registered. Blocked on Gerardo registering 1 test lock → re-check lockCount.
- [x] 🟢 TTLock creds (use **lock2.ttlock.com** account password, NOT euopen portal pw)
- [~] 🟡 P0 Generate long random `WEBHOOK_SECRET` — DONE locally (256-bit base64url in
      `middleware/.env`, 2026-06-16). STILL NEEDED: add it to Vercel middleware project env.
- [x] 🟢 Confirm `admin@rentstayable.com` owns the locks + the app (it does; auth OK)

### Phase 1 — Infrastructure (remote)
- [x] 🟢 P0 Provision **Neon Postgres** via Vercel Marketplace (`stayable-locks`, 2026-06-16)
- [~] 🟡 Create 2 Vercel projects → Root Dirs `middleware/`, `lock-app/`
      **lock-app DONE 2026-06-23**: project `lock-app` (prj_y94ZneZEErOo6cCEh5PZFoummxC8,
      team stayable-admins-projects) deployed to prod via CLI from `lock-app/` dir.
      Prod URL: **https://lock-app-dusky.vercel.app**. middleware project still TODO.
- [~] 🟡 Connect the one Neon DB to both projects (shared `DATABASE_URL`)
      lock-app: DATABASE_URL + DATABASE_URL_UNPOOLED + JWT_SECRET set (Production). DB
      connectivity verified live (auth/request → 200). Preview-env vars NOT set yet.
      OTP EMAIL NOW WIRED (2026-06-25, Resend) — login no longer needs the runtime
      logs once rise8companies.com is verified in Resend. CLI deploy is NOT
      Git-connected (no auto-deploy on push) — wire Git
      integration + Root Dir `lock-app/` in the dashboard if auto-deploys are wanted.

### Phase 2 — middleware: TTLock auth (validates creds) ⭐
- [x] 🟢 P0 Scaffold `middleware/` (Next 14 + TS) — typecheck + build pass
- [x] 🟢 P0 `lib/ttlock.ts` — token (MD5 password) + cache, listLocks, create/deletePasscode
- [x] 🟢 P0 `GET /api/ttlock-test` → returns auth status, uid, lockCount, isMainApp
- [x] 🟢 Deploy/run → hit `/api/ttlock-test` → `auth:success` on Vercel (2026-06-13)

### Phase 3 — Database (Prisma on Neon)
- [x] 🟢 P0 Schema: `LockMap`, `Passcode`, `EventLog` (`middleware/prisma/schema.prisma`)
      + `lib/db.ts` singleton; prisma generate + build pass. Committed (645bdb2).
- [x] 🟢 P0 Provision Neon (`stayable-locks`, Vercel→Storage). Strings pasted into
      `middleware/.env` by hand (Sensitive vars pull empty). `prisma db push` synced;
      3 tables verified live (LockMap/Passcode/EventLog, all empty). 2026-06-16.

### Phase 4 — middleware: webhook (core)
⚠️ DESIGN CORRECTED 2026-06-13 (verified vs Cloudbeds docs — build guide was wrong):
  - **Cloudbeds does NOT HMAC-sign webhooks.** No signature mechanism exists. Use a
    **secret URL token** instead: register endpoint as `/api/cloudbeds-webhook?token=<WEBHOOK_SECRET>`
    and verify the token (constant-time compare). `lib/webhook-auth.ts` = token check, not HMAC.
  - **Webhook payload is THIN** — `reservation/created` carries `version, timestamp, event,
    propertyID, propertyID_str, reservationID, startDate, endDate`; `status_changed` adds
    `status`; `deleted` is just propertyID+reservationID. **NO roomID.**
  - → Handler MUST call Cloudbeds **`getReservation(propertyID, reservationID)`** to get the
    assigned room(s) → roomID. A reservation can span multiple rooms → multiple PINs.
  - → Therefore middleware needs the **per-property Cloudbeds keys** (the 8-account registry,
    like the MCP), NOT a single `CLOUDBEDS_ACCESS_TOKEN`. Mirror `CloudbedsRegistry`.
  - Cloudbeds retries failed webhooks 5× at 1-min intervals; endpoint must return 2XX fast.
  - Source: https://developers.cloudbeds.com/docs/webhooks-1
- [x] 🟢 P0 `lib/webhook-auth.ts` — secret URL-token verify (NOT HMAC), constant-time compare
- [x] 🟢 P0 Port `CloudbedsRegistry` + `getReservation`/`extractRoomIds` into `middleware/lib/cloudbeds.ts` (per-property keys)
- [x] 🟢 P0 `POST /api/cloudbeds-webhook` — verify token → parse event → classify intent →
      getReservation for room(s) → map (propertyID,roomID)→lockId → create/delete PIN →
      store `keyboardPwdId` → log. Idempotent (safe under Cloudbeds 5× retry). Orchestration
      in `lib/passcode-sync.ts`. **typecheck + build pass (2026-06-15).**
- [ ] 🟡 P0 Validate against a **real Cloudbeds webhook sample** once an endpoint is registered.
      OPEN ASSUMPTION to verify live: roomID is read from `getReservation` → `data.rooms[].roomID`
      (extraction isolated in `extractRoomIds`); adjust if the live shape differs.
- [ ] 🟡 Refine PIN validity window to property-timezone check-in/out times (v1 uses UTC
      day-bounds, generous on both ends — see `validityWindow` in `passcode-sync.ts`).

### Phase 5 — lock-app: management UI (parallel once DB exists)
- [x] 🟢 Read-surfaces plan (`2026-06-17-lock-app-read-surfaces.md`, Plan 2 of 5) — DONE
      2026-06-17. App shell (hybrid nav + property switcher, permission-gated), Overview
      portfolio cards, Rooms grid (occupancy/health/masked code + search/filter), Devices
      inventory, Activity Log (search/filter + CSV export, amber/red tint). 4 pure view-model
      libs (properties/rooms/overview/activity) TDD — 32 tests pass. Dev seed (2 properties,
      super_admin user). typecheck/build green. NEXT: Plan 3 (code actions) or create the
      lock-app Vercel project to deploy.
- [x] 🟢 Foundation plan (`2026-06-16-lock-app-foundation.md`) — DONE 2026-06-16. Scaffolded
      Next 14 + TS + Tailwind; superset Prisma schema pushed to shared Neon (User/Role/
      Session/MagicLink/PropertyGroup/RoomState/TtlockToken + lock-health/Passcode.type
      mirrored to middleware); permission catalog + hasPermission (TDD, 5/5); magic-link
      auth (role-aware session) + RBAC helpers; 3 roles seeded; login page + auth routes
      (email stubbed → Plan 5). typecheck/build/tests pass. 9 commits.
- [x] 🟢 Admin code actions (Plan 3, 2026-06-20) — Door/Room detail page; guest
      reveal/revoke/manual, staff backup reveal/rotate (permanent code), sync-from-lock
      reconcile, LockMap CRUD; all permission-gated + audit-logged. Pure libs TDD
      (passcodes/reconcile/audit/door-detail). TTLock client ported. typecheck/build/tests
      green. LIVE-UNVERIFIED: needs a registered lock + reachable euapi.ttlock.com.
- [x] 🟢 Real OTP email (2026-06-25) — `lib/email.ts` via Resend; `createOtp` emails
      the code (fallback to console log). Prod env: RESEND_API_KEY + EMAIL_FROM set.
      OPEN: confirm rise8companies.com is DNS-verified in Resend (else sends fail).
- [x] 🟢 Portfolio visual redesign + app-wide base styles (2026-06-25) — 4-col card
      grid, design system in globals.css. TODO: same treatment for dashboard/rooms/
      devices/activity (still sparse inline styles).
- [x] 🟢 Demo data for all 8 properties (2026-06-25) — seed-dev.ts → 101 test locks
      in Neon; app-wide DEMO DATA strip. Re-run `npm run db:seed:dev` to reset.
- [x] 🟢 Login accounts (2026-06-25) — `seed-users.ts` + `db:seed:users` upserts 4
      super_admin/all users into prod Neon (rb@rise8companies, admin/bke/kate@rentstayable).
      OPEN: replace placeholder names (Rob/Admin/Kate) once real names known.
- [ ] 🟢 Field (mobile): room lookup → current PIN, mark lock registered

### Phase 6 — Cloudbeds webhook registration
- [ ] 🟡 Register webhook in all **8** Cloudbeds accounts → 1 endpoint
- [ ] 🟡 Resolve property identity per payload

### Phase 7 — End-to-end live test
- [ ] 🔴 P0 Gerardo registers 1 test lock to `main`; read its Lock ID
- [ ] 🟡 Map (property,room)→lockId; live reservation → PIN opens door → checkout deletes it

### Phase 8 — Hardening (tracked, not v1)
- [ ] Guest PIN delivery (Cloudbeds messaging/SMS) · token auto-refresh (90-day) · error alerting · TTLock plan upgrade at 912+ locks

### Blocked on others
- **Gerardo (on-site):** register locks to `main` (ignore old apps); read Lock IDs;
  devicethread→Stayable transfer for 5 installed properties; 1 test lock now.
- **Procurement:** TTLock plan tier for 912+ locks.

### Property lock counts (from build guide, 2026-06-11)
| Property | Cloudbeds ID | Locks | Lock status |
|----------|-------------|-------|-------------|
| Lakeland | 210972 | 176 | devicethread — transfer needed |
| St. Augustine | 208155 | 163 | devicethread — transfer needed |
| Davenport | 318197 | 178 | devicethread — transfer needed |
| Kissimmee East | 210986 | 206 | devicethread — transfer needed |
| Jacksonville West | 210987 | 189 | devicethread — transfer needed |
| Kissimmee West | 210969 | 176 | not yet purchased — register direct |
| Orlando OBT | 210971 | 214 | not yet purchased — register direct |
| Jacksonville North | 206628 | 150 | not yet purchased — ownership TBD |

---

## In Progress (as of 2026-06-09)
- **Stayable Vercel deploy** — importing `Stayable/cloudbeds_mcp02`. Hit
  "No Next.js version detected" → cause is **Root Directory not set to
  `cloudbeds-mcp-server`** (repo root has no package.json). Confirmed the pushed
  commit has `cloudbeds-mcp-server/package.json` with `next ^14.2.0`. Fix: set
  Root Directory = `cloudbeds-mcp-server` (Settings → Build & Deployment), then
  redeploy. Awaiting confirmation that this cleared the error.

## Current Sprint — local DONE, now launch on Stayable Vercel
- [x] **All 8 keys validated LIVE** — registry routing + getHotelDetails read
      confirmed for every property using the real Cloudbeds IDs.
- [x] **Committed + pushed to `Stayable/cloudbeds_mcp02`** (commit 2fabb65, default
      branch claude/brave-maxwell-756k2c). No secrets committed.
- [ ] **Create Stayable Vercel project** — import repo, Root Directory =
      `cloudbeds-mcp-server`, add env vars (8 keys keyed by REAL Cloudbeds ID +
      MCP_BEARER_TOKEN), deploy, disable Deployment Protection.
- [ ] **Rotate all 8 keys** after launch (they were pasted in chat).

## Backlog — Deployment
- [ ] **Fix Vercel root directory** — the `claude-code` Vercel project Root Directory
      is set to `middleware` (a folder that does not exist) → every build fails on clone.
      Change it to `cloudbeds-mcp-server` (or disconnect Git integration).
- [ ] **Set Vercel env vars** (Preview + Production):
      `MCP_BEARER_TOKEN`, `CLOUDBEDS_API_KEY_<id>` per property, optional `CLOUDBEDS_ALLOW_WRITES=true`.
- [ ] **Disable Deployment Protection** for the preview/prod deployment so external
      MCP clients reach `/api/mcp` instead of Vercel's 403.
- [ ] **Redeploy** after env vars (they only apply to new builds).
- [ ] **client-portal deploy** (separate Vercel project): needs `DATABASE_URL`,
      `JWT_SECRET`, `MAGIC_LINK_SECRET`, SMTP vars, `NEXT_PUBLIC_APP_URL`; build script
      likely needs `prisma generate && next build`.

## Backlog — Credentials & Properties
- [ ] **Add the remaining 7 property keys** — one `CLOUDBEDS_API_KEY_<id>` per
      Stayable Cloudbeds account (812, 2295, 2535, 4645, 5399, 6802, 8700, 44199).
      Each property is a separate account; create a self-service key from each.
- [ ] **ROTATE exposed key** — `cbat_LiIJ4VqGhckV80QvB91yRiFcPoRmeiT6` was pasted in
      a prior chat (claimed for 812 → 2535 → 5399; the latest stated mapping is 5399).
      Regenerate it in Cloudbeds and update env. Treat as compromised.
- [ ] **Confirm key→property mapping** definitively via `list_properties` once keys are set.

## Backlog — Code Quality / Verification
- [ ] **End-to-end live test** — once network access exists, call read tools against a
      real property and confirm responses (sandbox blocks `api.cloudbeds.com`).
- [ ] **Keep the two tool/client copies in sync** — `cloudbeds-mcp/src/{client,tools}.ts`
      ↔ `cloudbeds-mcp-server/lib/{cloudbeds,tools}.ts`. Consider extracting a shared
      package to eliminate the duplication risk.
- [ ] **Re-validate any new endpoints** against `pms-v1.2-openapi.yaml` before adding tools.

## Completed
- [x] Built `cloudbeds-mcp/` — local stdio MCP server, 15 tools.
- [x] Built `cloudbeds-mcp-server/` — deployable HTTP MCP server (Next.js + mcp-handler),
      bearer-token gated.
- [x] Validated all tool definitions against the official `pms-v1.2-openapi.yaml`
      (fixed `propertyIDs` plural params, `firstName`/`lastName` filters, removed the
      nonexistent `getTransactions`, corrected `reservationNote`/`cardType`).
- [x] Implemented per-property API key registry (`CloudbedsRegistry`) for the 8
      separate Cloudbeds accounts, with single-key fallback. Unit-tested routing.
- [x] Both packages build clean and register all 15 tools (verified).
- [x] Pushed to `rbeyer999/Claude-Code` branch `claude/serene-clarke-S0kHP` (commit 4da98c9).
- [x] Diagnosed Vercel failures as the unrelated `middleware` Root Directory misconfig.
- [x] Cloned repo into this workspace; created `CLAUDE.md` and `todo.md`.
- [x] Built `cloudbeds-mcp/` locally (npm install + tsc clean, `dist/` present).
- [x] Scaffolded `cloudbeds-mcp/.env` with all 8 property slots labeled (gitignored).
- [x] Registered the MCP for this project in `.mcp.json` (uses `node --env-file`,
      no secrets in the committed config).
- [x] Smoke-tested the stdio handshake — server starts, loads .env, registers all
      12 read tools (writes correctly hidden with ALLOW_WRITES=false).
- [x] Audited keys in previous_chat.md: only 1 key exists, mapping stated 3 ways.
- [x] Received fresh keys for all 8 properties; filled `cloudbeds-mcp/.env`.
- [x] Verified the registry loads all 8 property IDs (812, 2295, 2535, 4645,
      5399, 6802, 8700, 44199). NOT yet validated against live Cloudbeds API.
