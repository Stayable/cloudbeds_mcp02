# Stayable Smart Lock Middleware — Build Guide
**Project:** TTLock ↔ Cloudbeds Integration  
**Stack:** Next.js (Vercel) + TTLock OpenAPI (EU) + Cloudbeds API  
**Goal:** Replace devicethread SmartAccess with a self-managed middleware that automatically creates and deletes guest PIN codes based on Cloudbeds reservation events.

---

## How It Works (Plain English)

```
Guest books via Cloudbeds
        ↓
Cloudbeds fires a webhook event to your Vercel server
        ↓
Your middleware reads: room number, check-in date, check-out date
        ↓
Looks up: which TTLock lock ID is assigned to that room
        ↓
Calls TTLock API: create a PIN valid only from check-in to check-out
        ↓
Guest checks out → Cloudbeds fires checkout event → PIN deleted
```

No devicethread. No $4/lock/month. You own it.

---

## Credentials You Need (Collect These First)

| Credential | Where to Get It | Status |
|---|---|---|
| TTLock `client_id` | euopen.ttlock.com → Your App | ✓ `4ec9049d80234753b2238b28231da1a1` |
| TTLock `client_secret` | euopen.ttlock.com → View | ⬜ Retrieve this |
| TTLock account username | The email used to create the developer account | ⬜ Confirm |
| TTLock account password | Same account | ⬜ Confirm |
| Cloudbeds `client_id` | Cloudbeds Marketplace → API Credentials | ✓ Available |
| Cloudbeds `client_secret` | Same screen | ✓ Available |
| Cloudbeds `access_token` | Generated via OAuth flow | ⬜ Generate |
| Vercel project GitHub repo | Your existing repo | ✓ Confirmed |

---

## Phase 1 — Environment Setup

### Step 1.1 — Add environment variables to Vercel

Go to your Vercel project → Settings → Environment Variables. Add:

```
TTLOCK_CLIENT_ID=4ec9049d80234753b2238b28231da1a1
TTLOCK_CLIENT_SECRET=your_secret_here
TTLOCK_USERNAME=your_ttlock_account_email
TTLOCK_PASSWORD=your_ttlock_account_password
CLOUDBEDS_CLIENT_ID=your_cloudbeds_client_id
CLOUDBEDS_CLIENT_SECRET=your_cloudbeds_client_secret
CLOUDBEDS_ACCESS_TOKEN=your_cloudbeds_access_token
WEBHOOK_SECRET=make_up_a_random_string_here
```

Also add these to a `.env.local` file in your local repo (never commit this file — it should already be in `.gitignore`).

### Step 1.2 — Install one dependency

In your terminal, inside your project folder:

```bash
npm install md5
```

TTLock requires MD5-hashed passwords for authentication. This is the only new package needed.

---

## Phase 2 — TTLock Authentication

TTLock uses its own token system. Tokens expire every 90 days and must be refreshed.

### Step 2.1 — Create the TTLock auth utility

Create this file: `lib/ttlock.js`

```javascript
import md5 from 'md5';

const BASE_URL = 'https://euopen.ttlock.com';

// Generate a TTLock access token using your account credentials
export async function getTTLockToken() {
  const params = new URLSearchParams({
    clientId: process.env.TTLOCK_CLIENT_ID,
    clientSecret: process.env.TTLOCK_CLIENT_SECRET,
    username: process.env.TTLOCK_USERNAME,
    password: md5(process.env.TTLOCK_PASSWORD), // TTLock requires MD5-hashed password
  });

  const response = await fetch(`${BASE_URL}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();

  if (!data.access_token) {
    throw new Error(`TTLock auth failed: ${JSON.stringify(data)}`);
  }

  return data.access_token;
}

// Create a time-bounded passcode on a specific lock
export async function createPasscode({ lockId, passcode, startDate, endDate, accessToken }) {
  const params = new URLSearchParams({
    clientId: process.env.TTLOCK_CLIENT_ID,
    accessToken,
    lockId: String(lockId),
    passcode,
    passcodeName: `Guest-${Date.now()}`,
    startDate: String(startDate), // Unix timestamp in milliseconds
    endDate: String(endDate),     // Unix timestamp in milliseconds
    date: String(Date.now()),
  });

  const response = await fetch(`${BASE_URL}/v3/keyboardPwd/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  return response.json();
}

// Delete a passcode from a specific lock
export async function deletePasscode({ lockId, keyboardPwdId, accessToken }) {
  const params = new URLSearchParams({
    clientId: process.env.TTLOCK_CLIENT_ID,
    accessToken,
    lockId: String(lockId),
    keyboardPwdId: String(keyboardPwdId),
    date: String(Date.now()),
  });

  const response = await fetch(`${BASE_URL}/v3/keyboardPwd/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  return response.json();
}
```

### Step 2.2 — Test your TTLock connection

Create this file: `app/api/ttlock-test/route.js`

```javascript
import { getTTLockToken } from '@/lib/ttlock';

export async function GET() {
  try {
    const token = await getTTLockToken();
    return Response.json({ success: true, token_preview: token.slice(0, 10) + '...' });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

Deploy and visit: `https://your-vercel-url.vercel.app/api/ttlock-test`

✓ You should see `{ success: true, token_preview: "xxxxxxxxxx..." }`  
✗ If you see an error, your credentials are wrong — recheck client_secret and password.

---

## Phase 3 — Room-to-Lock Mapping

This is the bridge between Cloudbeds (rooms) and TTLock (locks). Every room needs a corresponding TTLock lock ID.

### Step 3.1 — Create the mapping file

Create this file: `lib/roomLockMap.js`

```javascript
// Maps Cloudbeds room ID → TTLock lock ID
// Format: 'cloudbeds_room_id': ttlock_lock_id (number)
// 
// HOW TO POPULATE THIS:
// 1. In TTLock app/portal: find each lock → note its Lock ID
// 2. In Cloudbeds: find the matching room → note its Room ID
// 3. Add each pair below
//
// This file grows as locks are installed and registered.

export const ROOM_LOCK_MAP = {
  // Example — replace with real data:
  // 'CB_ROOM_101': 12345678,
  // 'CB_ROOM_102': 12345679,
};

export function getLockIdForRoom(cloudbedsRoomId) {
  return ROOM_LOCK_MAP[cloudbedsRoomId] || null;
}
```

> **Note:** This file will be empty until locks are physically installed and registered to your TTLock account. That's fine — the middleware will simply log "no lock found for room" and skip gracefully.

---

## Phase 4 — Cloudbeds Webhook Listener

This is the core of the middleware. Cloudbeds will POST to this endpoint every time a reservation event occurs.

### Step 4.1 — Create the webhook endpoint

Create this file: `app/api/cloudbeds-webhook/route.js`

```javascript
import { getTTLockToken, createPasscode, deletePasscode } from '@/lib/ttlock';
import { getLockIdForRoom } from '@/lib/roomLockMap';

// Events we care about
const HANDLED_EVENTS = [
  'reservation.created',
  'reservation.modified',
  'reservation.checked_in',
  'reservation.checked_out',
  'reservation.cancelled',
];

export async function POST(request) {
  try {
    const body = await request.json();
    const { event, data } = body;

    console.log(`[Webhook] Received event: ${event}`);

    // Ignore events we don't handle
    if (!HANDLED_EVENTS.includes(event)) {
      return Response.json({ received: true, action: 'ignored' });
    }

    const roomId = data?.room_id || data?.roomId;
    const checkIn = data?.check_in;   // ISO date string: "2026-06-15"
    const checkOut = data?.check_out; // ISO date string: "2026-06-20"
    const reservationId = data?.reservation_id;

    if (!roomId) {
      console.warn('[Webhook] No room ID in payload');
      return Response.json({ received: true, action: 'no_room_id' });
    }

    // Look up which lock corresponds to this room
    const lockId = getLockIdForRoom(String(roomId));

    if (!lockId) {
      console.warn(`[Webhook] No lock mapped for room: ${roomId}`);
      return Response.json({ received: true, action: 'no_lock_mapped', roomId });
    }

    const accessToken = await getTTLockToken();

    // Handle checkout and cancellation — delete the passcode
    if (event === 'reservation.checked_out' || event === 'reservation.cancelled') {
      // Note: You'll need to store keyboardPwdId when creating passcodes
      // For now, log the intent
      console.log(`[Webhook] Should delete passcode for lock ${lockId}, reservation ${reservationId}`);
      return Response.json({ received: true, action: 'delete_passcode_pending' });
    }

    // Handle check-in and reservation creation — create a passcode
    if (checkIn && checkOut) {
      // Convert check-in/out dates to Unix timestamps (milliseconds)
      const startDate = new Date(checkIn + 'T15:00:00').getTime(); // 3pm check-in
      const endDate = new Date(checkOut + 'T11:00:00').getTime();  // 11am check-out

      // Generate a random 6-digit PIN
      const passcode = Math.floor(100000 + Math.random() * 900000).toString();

      const result = await createPasscode({
        lockId,
        passcode,
        startDate,
        endDate,
        accessToken,
      });

      console.log(`[Webhook] Created passcode for room ${roomId}, lock ${lockId}:`, result);

      // TODO: Store the passcode and keyboardPwdId in a database for later deletion
      // TODO: Send the PIN to the guest via Cloudbeds messaging

      return Response.json({
        received: true,
        action: 'passcode_created',
        roomId,
        lockId,
        passcode, // Remove this from response in production
        result,
      });
    }

    return Response.json({ received: true, action: 'no_dates' });

  } catch (error) {
    console.error('[Webhook] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

### Step 4.2 — Register the webhook in Cloudbeds

1. Go to Cloudbeds → Marketplace → API Credentials
2. Find your API credential → click to edit
3. Look for **Webhooks** section
4. Add your endpoint URL: `https://your-vercel-url.vercel.app/api/cloudbeds-webhook`
5. Select events: `reservation.created`, `reservation.modified`, `reservation.checked_in`, `reservation.checked_out`, `reservation.cancelled`

---

## Phase 5 — Test End to End

### Step 5.1 — Test with a fake webhook payload

Use a tool like Postman or this curl command in your terminal:

```bash
curl -X POST https://your-vercel-url.vercel.app/api/cloudbeds-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "reservation.created",
    "data": {
      "reservation_id": "TEST-001",
      "room_id": "CB_ROOM_101",
      "check_in": "2026-06-20",
      "check_out": "2026-06-25"
    }
  }'
```

Expected response: `{ received: true, action: 'no_lock_mapped', roomId: 'CB_ROOM_101' }`  
(Because the mapping table is empty — that's correct behavior.)

### Step 5.2 — Add a test lock

Once you have one real lock registered in your TTLock account:
1. Find its Lock ID in the TTLock app or developer portal
2. Find the matching Cloudbeds Room ID
3. Add to `lib/roomLockMap.js`
4. Repeat the curl test above
5. Check the lock — a PIN should have been created

---

## What's Left After This (Phase 6+)

| Item | Priority | Notes |
|---|---|---|
| Database for storing created passcodes | High | Need keyboardPwdId to delete later |
| Guest PIN delivery | High | Send via Cloudbeds messaging or SMS |
| Token refresh logic | High | TTLock tokens expire every 90 days |
| Error alerting | Medium | Email/Slack if webhook fails |
| TTLock plan upgrade | Medium | Required at 912+ locks |
| Full room-lock mapping | Depends on locks arriving | Populate as each property goes live |

---

## Properties & Lock Counts Reference

| Property | ID | Locks | Status |
|---|---|---|---|
| Lakeland | 4645 | 176 | Installed — devicethread (transfer needed) |
| St. Augustine | 2535 | 163 | Installed — devicethread (transfer needed) |
| Davenport | 44199 | 178 | Installed — devicethread (transfer needed) |
| Kissimmee East | 2295 | 206 | Installed — devicethread (transfer needed) |
| Jacksonville West | 6802 | 189 | Installed — devicethread (transfer needed) |
| Kissimmee West | 5399 | 176 | Not yet purchased — register direct to Stayable |
| Orlando OBT | 8700 | 214 | Not yet purchased — register direct to Stayable |
| Jacksonville North | 812 | 150 | Not yet purchased — ownership TBD |

---

*Last updated: June 11, 2026*  
*TTLock endpoint: euopen.ttlock.com (EU)*  
*Vercel project: Next.js App Router*
