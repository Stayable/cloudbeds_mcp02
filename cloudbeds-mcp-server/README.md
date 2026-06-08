# Cloudbeds MCP Server (deployable)

The **hosted / HTTP** version of the Cloudbeds MCP, deployable to Vercel. It
serves the same Cloudbeds PMS tools as the local `cloudbeds-mcp` stdio package,
but over **Streamable HTTP** so the whole team can connect to one URL instead of
each person running Node locally.

- Stdio (local, per-user): `../cloudbeds-mcp`
- HTTP (hosted, shared): **this package**

Both expose identical tools (validated against `pms-v1.2-openapi.yaml`).

## Endpoint

```
https://<your-deployment>.vercel.app/api/mcp
```

Every request must send `Authorization: Bearer <MCP_BEARER_TOKEN>`. The server
**fails closed**: no token configured → `503`; wrong token → `401`.

## Deploy to Vercel

1. Push this repo (already done if you see it on GitHub).
2. Vercel → **Add New → Project** → import `rbeyer999/Claude-Code`.
3. **Root Directory → `cloudbeds-mcp-server`** (this is the critical setting —
   one Vercel project per deployable folder).
4. **Environment Variables:**
   | Var | Required | Notes |
   |-----|----------|-------|
   | `MCP_BEARER_TOKEN` | yes | Shared secret. `openssl rand -hex 32`. |
   | `CLOUDBEDS_API_KEY_<propertyID>` | yes* | **Per-property** self-service key, e.g. `CLOUDBEDS_API_KEY_5399`. Stayable's 8 properties are separate Cloudbeds accounts, so set one per property. |
   | `CLOUDBEDS_API_KEY` | no | Fallback key when a call has no `propertyID` / no per-property match (single-property setups). |
   | `CLOUDBEDS_ACCESS_TOKEN` | no | OAuth bearer token (alternative single credential). |
   | `CLOUDBEDS_ALLOW_WRITES` | no | `true` to enable payment/note/status tools. |
   | `CLOUDBEDS_BASE_URL` | no | Defaults to `https://api.cloudbeds.com/api/v1.2`. |

   *Set a per-property key for each property you want to reach (or a single
   `CLOUDBEDS_API_KEY`/`CLOUDBEDS_ACCESS_TOKEN` fallback). Each tool call routes
   to the key matching its `propertyID`; `list_properties` fans out across all
   configured keys so you can confirm which property each one resolves to.
5. **Deploy.**

> This is a **separate Vercel project** from the existing (broken) `claude-code`
> one. Do not reuse that project — its Root Directory points at a folder that
> doesn't exist.

## Connect a client

**Claude Code**
```bash
claude mcp add --transport http cloudbeds \
  https://<your-deployment>.vercel.app/api/mcp \
  --header "Authorization: Bearer <MCP_BEARER_TOKEN>"
```

**Claude Desktop / Cursor (`mcp.json`)**
```json
{
  "mcpServers": {
    "cloudbeds": {
      "url": "https://<your-deployment>.vercel.app/api/mcp",
      "headers": { "Authorization": "Bearer <MCP_BEARER_TOKEN>" }
    }
  }
}
```

## Local dev

```bash
cd cloudbeds-mcp-server
npm install
cp .env.example .env.local   # fill in MCP_BEARER_TOKEN + CLOUDBEDS_API_KEY
npm run dev                  # http://localhost:3000/api/mcp
```

## Security notes

- This endpoint reads (and, if writes are enabled, mutates) live PMS data.
  Keep `MCP_BEARER_TOKEN` secret and rotate it if leaked.
- The bearer gate is a shared secret, not per-user OAuth. For per-user identity
  and scopes, `mcp-handler` supports `withMcpAuth` + an OAuth authorization
  server — upgrade to that if you need audit trails per person.
- Cloudbeds method availability still depends on your key's scopes; a method can
  exist and still `403`.

## Notes on duplication

`lib/cloudbeds.ts` and `lib/tools.ts` mirror the stdio package. Vercel builds a
single root directory and can't import from a sibling folder, so the code is
duplicated by design. If you want a single source of truth later, convert the
repo to an npm workspace and extract a shared `cloudbeds-core` package.
