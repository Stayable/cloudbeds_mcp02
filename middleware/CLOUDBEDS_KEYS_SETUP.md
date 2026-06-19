# Middleware — Cloudbeds Key & Env Setup Guide

Fill-in guide for wiring the TTLock middleware to Cloudbeds. The webhook payload
carries **no roomID**, so the middleware calls Cloudbeds `getReservation` to find
the assigned room(s) before mapping to a lock — which means it needs one API key
per property (8 separate Cloudbeds accounts).

**Decision (2026-06-15): mint dedicated, read-only keys for the middleware** —
separate from the `cloudbeds-mcp-server` keys. Independent rotation + smaller
blast radius (the middleware only ever reads).

---

## 1. Mint a read-only API key in each Cloudbeds account (×8)

Each Stayable property is its own Cloudbeds account, so repeat this in all 8.

1. Log into the property's Cloudbeds account.
2. Go to the **API / Authentication credentials** section and generate a new
   **self-service API key** (these are the `cbat_…` tokens).
   - ⚠️ The exact menu path varies by Cloudbeds account/role — typically under
     **Settings → API Credentials** (or Account → Apps). If you can't find it,
     it's the same place you generated the existing MCP keys. *Verify the menu
     label in your account; I'm not 100% certain of the current UI path.*
3. Scope it **read-only** if the UI offers scopes. The middleware only calls
   `getReservation` (read). It never writes.
4. Label it `stayable-lock-middleware` so it's distinguishable from the MCP key.
5. Copy the `cbat_…` value — you'll paste it below.

---

## 2. Map each key to its env var (use the REAL Cloudbeds ID, not the street code)

| Property | Street code | **Real Cloudbeds ID** | Env var |
|----------|-------------|-----------------------|---------|
| Jacksonville North | 812 | **206628** | `CLOUDBEDS_API_KEY_206628` |
| Jacksonville West | 6802 | **210987** | `CLOUDBEDS_API_KEY_210987` |
| Kissimmee East | 2295 | **210986** | `CLOUDBEDS_API_KEY_210986` |
| Kissimmee West | 5399 | **210969** | `CLOUDBEDS_API_KEY_210969` |
| Lakeland | 4645 | **210972** | `CLOUDBEDS_API_KEY_210972` |
| Orlando OBT | 8700 | **210971** | `CLOUDBEDS_API_KEY_210971` |
| St. Augustine | 2535 | **208155** | `CLOUDBEDS_API_KEY_208155` |
| Davenport | 44199 | **318197** | `CLOUDBEDS_API_KEY_318197` |

The code keys env vars by the **real Cloudbeds ID** (the number in each account's
`live1_<realID>_…` Client ID). The street code is only a human label.

---

## 3. Generate the webhook secret (you invent this — it's not from Cloudbeds)

It's a random string that does double duty: stored in env **and** appended to the
webhook URL you register in Cloudbeds. Generate it, don't paste it into chat:

```bash
openssl rand -hex 32
```
PowerShell:
```powershell
-join ((48..57)+(97..102) | Get-Random -Count 64 | %{[char]$_})
```

You'll register the webhook (all 8 accounts → one endpoint) as:
```
POST https://<your-middleware-domain>/api/cloudbeds-webhook?token=<WEBHOOK_SECRET>
```
The handler does a constant-time compare of `?token=` against `WEBHOOK_SECRET`.
(Cloudbeds does not sign webhooks, so this token IS the auth.)

---

## 4. Fill in `.env.local` (gitignored — never commit)

```dotenv
# --- Neon (pulled from Vercel: `vercel env pull .env.local`) ---
DATABASE_URL=
DATABASE_URL_UNPOOLED=

# --- TTLock (already validated; lock2.ttlock.com account password, NOT euopen) ---
TTLOCK_CLIENT_ID=
TTLOCK_CLIENT_SECRET=
TTLOCK_USERNAME=admin@rentstayable.com
TTLOCK_PASSWORD=
TTLOCK_BASE_URL=https://euapi.ttlock.com

# --- Webhook auth (you generate this) ---
WEBHOOK_SECRET=

# --- Cloudbeds read-only keys (one per property, real Cloudbeds ID) ---
CLOUDBEDS_API_KEY_206628=cbat_   # Jacksonville North
CLOUDBEDS_API_KEY_210987=cbat_   # Jacksonville West
CLOUDBEDS_API_KEY_210986=cbat_   # Kissimmee East
CLOUDBEDS_API_KEY_210969=cbat_   # Kissimmee West
CLOUDBEDS_API_KEY_210972=cbat_   # Lakeland
CLOUDBEDS_API_KEY_210971=cbat_   # Orlando OBT
CLOUDBEDS_API_KEY_208155=cbat_   # St. Augustine
CLOUDBEDS_API_KEY_318197=cbat_   # Davenport
```

Set the **same** vars in the Vercel **middleware** project (Settings → Environment
Variables, Production + Preview). Env changes only apply to new builds — redeploy
after adding them.

---

## 5. Checklist

- [ ] 8 read-only `cbat_…` keys minted, labeled `stayable-lock-middleware`
- [ ] All 8 keys set in `.env.local` + Vercel middleware project
- [ ] `WEBHOOK_SECRET` generated, set in both places
- [ ] `DATABASE_URL` + `DATABASE_URL_UNPOOLED` pulled from Vercel
- [ ] `prisma db push` run → LockMap / Passcode / EventLog tables exist
- [ ] (Phase 6) Webhook registered in all 8 Cloudbeds accounts → one endpoint
- [ ] (Phase 7) At least one `LockMap` row from Gerardo's test lock
