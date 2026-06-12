# Stayable Lock Middleware

Headless TTLock ↔ Cloudbeds webhook service. Auto-creates and deletes guest door
PINs from Cloudbeds reservation events. Replaces devicethread SmartAccess.

Vercel-deployable (Next.js 14 App Router, Node.js runtime). Shares one Neon
Postgres DB with the `lock-app` management UI — the DB is the integration point
(Vercel can't import across sibling folders, so the apps share *data*, not code).

See the design spec:
`../docs/superpowers/specs/2026-06-12-ttlock-cloudbeds-middleware-design.md`.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in TTLock creds (never commit)
npm run typecheck
npm run dev
```

## Routes

| Route | Status | Purpose |
|-------|--------|---------|
| `GET /api/ttlock-test` | ✅ Phase 2 | Credential probe — confirms auth + that the `client_id` is the **main** app (returns `lockCount`). |
| `POST /api/cloudbeds-webhook` | ⬜ Phase 4 | HMAC-verified reservation handler; creates/deletes PINs. |

### Validating TTLock credentials (Phase 2)

The sandbox blocks outbound TTLock calls, so run this on a networked machine or a
deployed preview:

```bash
curl -s http://localhost:3000/api/ttlock-test | jq
```

Expected on success:

```json
{ "ok": true, "auth": "success", "lockCount": 12, "isMainApp": true, ... }
```

- `auth: "failed"` → bad client_id/secret/username/password.
- `auth: "success"` but `lockCount: 0` → **wrong (old) app**, or no locks
  registered to the account yet. This is the exact failure the spec warns about.

No secrets or full tokens are ever returned — only previews and a count.

## TTLock notes

- One account, one Application ("Stayable Access — main"). Locks are globally
  unique within the account — no per-property routing.
- Auth: OAuth2 password grant, password MD5-hashed. Tokens last ~90 days and are
  cached in-process; durable caching + scheduled refresh is a tracked follow-up.
- EU API gateway `euapi.ttlock.com` (NOT `euopen.ttlock.com` — that's the
  docs/portal and 404s on API calls). Period passcodes use `keyboardPwdType=3`;
  push via gateway uses `addType=2` / `deleteType=2`.
