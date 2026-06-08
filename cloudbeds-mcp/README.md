# Cloudbeds MCP

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
the **Cloudbeds PMS API (v1.2)** as tools, for use across RISE8 / Stayable's
8 properties. Connect it to Claude (Desktop, Code, or any MCP client) to query
reservations, occupancy, guests, availability, rates, and payments in natural
language.

## What it does

Read-only by default. Write tools are off unless you explicitly enable them.

| Tool | Cloudbeds method | Purpose |
|------|------------------|---------|
| `list_properties` | `getHotels` | Discover property IDs — **run this first** |
| `get_property` | `getHotelDetails` | Property settings/details |
| `get_dashboard` | `getDashboard` | Occupancy & KPI figures |
| `list_reservations` | `getReservations` | Reservations by status / date range |
| `get_reservation` | `getReservation` | Single reservation detail |
| `list_guests` | `getGuestList` | Guests by status / dates |
| `get_guest` | `getGuest` | Single guest record |
| `get_availability` | `getAvailableRoomTypes` | Available room types for dates |
| `list_room_types` | `getRoomTypes` | Room type config |
| `list_rooms` | `getRooms` | Physical rooms & status |
| `get_rate_plans` | `getRatePlans` | Rate plans |
| `list_reservations_with_rates` | `getReservationsWithRateDetails` | Reservations with rate/source/transaction detail |
| `post_reservation_note` | `postReservationNote` | **WRITE** — add note |
| `post_payment` | `postPayment` | **WRITE** — record payment |
| `put_reservation_status` | `putReservation` | **WRITE** — check in/out, cancel |

Write tools only register when `CLOUDBEDS_ALLOW_WRITES=true`.

## Setup

```bash
cd cloudbeds-mcp
npm install
npm run build
```

Get a self-service API key from Cloudbeds: **Account → Apps & Marketplace →
API Credentials** (or the OAuth flow for marketplace apps). The key must have
scopes for the data you query; keys expire if unused for 30 days.

```bash
cp .env.example .env
# then edit .env and set CLOUDBEDS_API_KEY
```

## Connecting to Claude

### Claude Code

```bash
claude mcp add cloudbeds \
  --env CLOUDBEDS_API_KEY=your_key_here \
  -- node /absolute/path/to/cloudbeds-mcp/dist/index.js
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "cloudbeds": {
      "command": "node",
      "args": ["/absolute/path/to/cloudbeds-mcp/dist/index.js"],
      "env": {
        "CLOUDBEDS_API_KEY": "your_key_here"
      }
    }
  }
}
```

For development without building, use `tsx`:
`"command": "npx", "args": ["tsx", "/absolute/path/to/cloudbeds-mcp/src/index.ts"]`

## Configuration

| Env var | Default | Notes |
|---------|---------|-------|
| `CLOUDBEDS_API_KEY_<propertyID>` | — | **Per-property** self-service key, e.g. `CLOUDBEDS_API_KEY_5399`. Stayable's 8 properties are separate Cloudbeds accounts; set one per property. Calls route to the key matching their `propertyID`. |
| `CLOUDBEDS_API_KEY` | — | Fallback key when a call has no `propertyID` / no per-property match. |
| `CLOUDBEDS_ACCESS_TOKEN` | — | OAuth 2.0 bearer token (alternative single credential). |
| `CLOUDBEDS_BASE_URL` | `https://api.cloudbeds.com/api/v1.2` | API base. |
| `CLOUDBEDS_ALLOW_WRITES` | `false` | `true` enables write tools. |

## Multi-property note

Stayable's internal property IDs (Jacksonville West 6802, Kissimmee East 2295,
etc.) are **not** guaranteed to equal Cloudbeds' `propertyID` values. Always run
`list_properties` to get the real Cloudbeds IDs, then pass `propertyID` to the
other tools. A single-property key may not require `propertyID`; a group/portfolio
key does.

## Endpoint accuracy & caveats

Method names and parameters are validated against the official
[Cloudbeds OpenAPI spec](https://github.com/cloudbeds/openapi-specs)
(`pms-v1.2-openapi.yaml`) — the same source the developer docs are generated
from. Still worth knowing:

- **Scopes/plan gate availability.** Each method requires its OAuth scope
  (`read:reservation`, `write:payment`, etc.) or an API key with equivalent
  permissions. A method that exists in the spec can still 403 if your key lacks
  the scope. Test against your account.
- **Single vs. multi-property params.** Some methods take `propertyID`, others
  `propertyIDs` (comma-separated). This is encoded per-tool. Group/portfolio
  keys must pass the property; single-property keys may omit it.
- Cloudbeds requires HTTPS and returns an `X-Request-ID` on every response —
  errors surfaced by this server include it for Cloudbeds support tickets.
- This server holds API credentials. Treat `.env` as a secret; it is gitignored.

## License

Internal RISE8 tooling.
