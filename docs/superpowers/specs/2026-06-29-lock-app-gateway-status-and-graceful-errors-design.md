# Lock-App: Gateway Status + Graceful Action Errors — Design

Date: 2026-06-29
Status: APPROVED (design)
Author: BK + Claude

## Problem

Two related gaps on the lock-app's Devices / room-detail / lock-detail screens:

1. **No gateway visibility.** `LockMap.gatewayId` exists in the schema and the
   lock-detail card has a "Gateway" row, but nothing ever populates it (always
   "—"). There's no Gateway table and no way to see which gateways a property has
   or whether they're online. Operators can't tell *why* a lock is unreachable.

2. **Action failures crash the page.** Room/lock pages fire server actions
   through inline `<form action={…}>`. When an action `throw`s — e.g. TTLock
   `errcode -2012` "not connected to any Gateway" on room 239, or a fast
   double-click racing the 5th backup rotate on lock 238 — the throw propagates
   with no error boundary, so Next.js renders the generic "Application error: a
   server-side exception has occurred. Digest: …" page. Production hides the real
   message, and once the route is in that error state, browser **back doesn't
   rehydrate** the previous page.

These connect: the 239 failure is *"no gateway connected → can't push code →
crash."* Making gateway status visible explains the failure; graceful errors stop
it from crashing.

## Goals

- Surface gateways per property (status, locks served) on Devices.
- Show each lock's gateway (name + status) on the lock-detail card, linking to a
  gateway-detail page.
- Replace the crash page with an in-page dismissible modal for expected failures,
  prevent double-submit races, and keep navigation healthy via an error boundary.

## Non-goals (YAGNI)

- Live/real-time gateway polling on page load (synced table only).
- Storing the *full* set of gateways a lock can reach (store one **primary**).
- Gateway provisioning/registration (TTLock-app concern, on-site).
- Per-gateway battery/firmware analytics beyond what TTLock returns cheaply.

---

## Part A — Gateway status

### A1. Data model (both schemas — keep in sync, per repo convention)

New **`Gateway`** model, keyed by the account-global `gatewayId` (gateways are
account-global in the single TTLock account, like locks — no per-property split):

```prisma
model Gateway {
  gatewayId    BigInt    @id
  name         String
  propertyId   String?   // inferred from served locks; null until it serves a known lock
  online       Boolean   @default(false)
  lockCount    Int?      // TTLock lockNum (locks bound to the gateway)
  networkName  String?
  model        String?
  lastSeen     DateTime?
  discoveredAt DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```

- `LockMap.gatewayId` (already present) is populated by the sync.
- Add a nullable `gatewayId BigInt?` to **`UnassignedLock`** so the lock-detail
  card resolves a gateway for pooled (unassigned) locks too.
- A lock can physically reach multiple gateways; we store **one primary** (first
  returned by TTLock). Documented v1 simplification.

### A2. TTLock client methods (port into lock-app `ttlock.ts`; add to middleware for parity)

- `listGateways(pageNo, pageSize)` → already in middleware; port to lock-app.
  Returns `{ total, list }` with `gatewayId, gatewayName, isOnline, lockNum,
  networkName, …`.
- `listLocksForGateway(gatewayId, pageNo, pageSize)` → **new in both**, calls
  `/v3/gateway/listLock` (params: `clientId, accessToken, gatewayId, pageNo,
  pageSize, date`). Returns the locks bound to a gateway. We iterate gateways
  (few) rather than locks (~1,450), so this is the cheap direction.

### A3. Sync (`lock-app/src/lib/gateway-sync.ts`, mirrors `lock-sync.ts`)

Runs **after** the lock discovery sync (so `LockMap` is fresh for property
inference), folded into the **existing discovery Sync action** (`syncLocks` in
`unassigned/actions.ts`, the "Sync" button) so one button runs locks → gateways —
no new button. (Discovery is button-triggered today; the only cron is
`sync-occupancy`. If a discovery cron is added later, gateway sync rides it for
free since it lives in the same flow.)

1. `listGateways()` → all gateways (paged).
2. For each gateway, `listLocksForGateway()` → its served lockIds.
3. For each served lock, resolve its propertyId: `LockMap.propertyId` if mapped,
   else reverse the `UnassignedLock` pool name → propertyId. Feed the list to the
   pure `inferGatewayProperty` (most common non-null; tie/none → null).
4. Upsert `Gateway` rows (status, lockCount, name, inferred propertyId, lastSeen).
5. Set `LockMap.gatewayId` / `UnassignedLock.gatewayId` for served locks (primary).
6. Per-gateway errors captured in a `GatewaySyncSummary.errors[]` — one failure
   never aborts the run (same shape/discipline as `SyncSummary`).

Idempotent and safe to re-run.

### A4. Pure logic (`lock-app/src/lib/gateway-view.ts`) — TDD

- `inferGatewayProperty(propIds: (string | null)[]): string | null` — most common
  non-null propertyId; null when empty or all-null.
- `toGatewayRow(g): GatewayRow` — DB row → display row (BigInt→string, status,
  formatted lastSeen, lockCount).

### A5. UI / navigation

- **Devices page** (`/p/[propertyId]/devices`): a new **Gateways** section above
  the locks table — rows for gateways whose inferred `propertyId` === this
  property (name, online/offline pill, # locks served, last seen). Each row links
  to the gateway-detail page. Section hidden if the property has no gateways.
- **Lock-detail card** (`/p/[propertyId]/devices/[lockId]`): the existing
  "Gateway" row changes from the raw id to **gateway name + status pill, as a
  `Link`** to the gateway-detail page. Shows "not connected" when the lock has no
  gateway.
- **Room-detail card** (`/p/[propertyId]/rooms/[roomId]`, "Lock health"): same
  gateway line added (name + status, linked), so front-desk sees connectivity
  where they manage codes.
- **New gateway-detail page**
  `/p/[propertyId]/devices/gateways/[gatewayId]/page.tsx` — mirrors lock-detail:
  header (name + status), health card (online/offline, last seen, network/model),
  and the **list of locks it serves**, each linking back to its lock-detail.
  Guards on `devices.view` for the property and that the gateway's `propertyId`
  matches (else `Forbidden`). The static `gateways` segment safely takes priority
  over the sibling dynamic `[lockId]` route.

---

## Part B — Graceful action errors

### B1. Server actions return a result instead of throwing (expected failures)

Introduce a shared result type:

```ts
export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };
```

Affected actions (room-detail `actions.ts`, plus `lock-actions.ts`): `revealGuestCode`,
`revokeGuestCode`, `generateManualCode`, `revealBackupCode`, `rotateBackupCode`,
`syncFromLock`, `assignLockToRoom`, `unmapRoom`. Each catches expected failures and
returns `{ ok: false, error }` with friendly text. Mapping:

- TTLock `-2012` / "not connected" / "gateway" → *"This lock isn't connected to a
  gateway yet, so the code couldn't be pushed to it. Get the lock online, then try
  again."*
- "Room is not mapped to a lock" / "No active … code" → pass through (already
  human-readable).
- Anything unmapped → generic *"Something went wrong — please try again."* and the
  original error is still logged server-side (EventLog `*_failed` where those
  already exist).

Reveal actions return `{ ok: true, data: { pin } } | { ok: false, error }`.

### B2. Client `<ActionButton>` wrapper

Replaces the inline `<form action={…}>` buttons. Props: `label`, a bound server
action returning `ActionResult`, optional `variant`/`confirm`. Behaviour:

- Calls the action inside `useTransition`; the button is **disabled while
  `isPending`** — this removes the 238 double-submit race.
- On `{ ok: false }` → opens the `<ActionError>` modal with `error`.
- On `{ ok: true }` → `router.refresh()` (server `revalidatePath` already runs in
  the action; refresh re-pulls the server-rendered data).

`RevealButton` is updated to the same contract: on `{ ok:false }` show the modal;
on `{ ok:true }` reveal `data.pin`.

### B3. `<ActionError>` modal (shared client component)

Centered dialog over a dimmed backdrop: the message + an **✕ close** button (and
backdrop/Esc close). Closing only dismisses — **no navigation**, the page and all
its data stay loaded. Reused by `ActionButton` and `RevealButton`.

### B4. `error.tsx` boundary (safety net)

Add `error.tsx` at the `(app)` segment (covers room/lock/devices/gateway pages):
a friendly card — "Something went wrong" + `reset()` ("Try again") + a "Back"
link. Catches any *unexpected* throw so the raw Next overlay never appears, and
keeps the router healthy so back/forward rehydrate correctly.

---

## Testing

- **TDD (pure):** `inferGatewayProperty`, `toGatewayRow` (gateway-view.test.ts);
  the friendly-error mapper (`mapActionError`) gets its own pure helper + tests
  (TTLock -2012 → gateway text, unknown → generic, human messages pass through).
- **Integration glue** (`gateway-sync`, server actions, UI): verified via
  `tsc --noEmit`, `vitest run`, and `next build` for both packages.
- **Live-unverifiable from the sandbox** (TTLock + Cloudbeds blocked): real gateway
  status, the 239 offline-popup, and the 238 race must be confirmed on the
  deployed app. Manual check list:
  - Room 239 → Generate/rotate a code with the gateway offline → friendly modal,
    no crash, page stays loaded.
  - Lock 238 → rapid-click rotate on a slot → button locks, exactly one code, no
    error.
  - Lock-detail / room-detail → Gateway line shows name + status, links to the
    gateway page; gateway page lists its locks.

## Sequencing note

Part B (graceful errors) addresses a *live crash* and is independent of Part A's
data work — the implementation plan should land Part B first, then Part A.

## Files (anticipated)

- `lock-app/prisma/schema.prisma`, `middleware/prisma/schema.prisma` — Gateway
  model, `UnassignedLock.gatewayId`. Push to shared Neon (additive/nullable).
- `lock-app/src/lib/ttlock.ts`, `middleware/lib/ttlock.ts` — gateway methods.
- `lock-app/src/lib/gateway-sync.ts`, `gateway-view.ts` (+ tests).
- `lock-app/src/lib/action-result.ts` (`ActionResult`, `mapActionError` + test).
- `lock-app/src/components/ActionButton.tsx`, `ActionError.tsx`; update
  `RevealButton.tsx`.
- `lock-app/src/app/(app)/error.tsx`.
- Devices page + new `devices/gateways/[gatewayId]/page.tsx`; lock-detail +
  room-detail cards; `actions.ts` + `lock-actions.ts` (return `ActionResult`).
- Wire `gateway-sync` into the existing discovery `syncLocks` action
  (`unassigned/actions.ts`), after `syncDiscoveredLocks`.
