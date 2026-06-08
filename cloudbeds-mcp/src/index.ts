#!/usr/bin/env node
/**
 * Cloudbeds MCP server (RISE8 / Stayable) — local stdio transport.
 *
 * Exposes the operational Cloudbeds PMS endpoints as MCP tools over stdio.
 * Read tools are always available; write tools are gated behind
 * CLOUDBEDS_ALLOW_WRITES=true so a misconfigured client can't mutate the PMS.
 *
 * Auth (env): Stayable's 8 properties are separate Cloudbeds accounts, so set a
 * per-property key as CLOUDBEDS_API_KEY_<propertyID> (e.g. CLOUDBEDS_API_KEY_5399).
 * A bare CLOUDBEDS_API_KEY or CLOUDBEDS_ACCESS_TOKEN works as a fallback.
 *   CLOUDBEDS_BASE_URL       defaults to https://api.cloudbeds.com/api/v1.2
 *   CLOUDBEDS_ALLOW_WRITES   "true" to enable post/put tools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CloudbedsRegistry } from "./client.js";
import { registerCloudbedsTools } from "./tools.js";

const BASE_URL =
  process.env.CLOUDBEDS_BASE_URL?.replace(/\/$/, "") ??
  "https://api.cloudbeds.com/api/v1.2";
const ALLOW_WRITES = process.env.CLOUDBEDS_ALLOW_WRITES === "true";

const registry = CloudbedsRegistry.fromEnv();

const server = new McpServer({ name: "cloudbeds-mcp", version: "0.1.0" });
registerCloudbedsTools(server, registry, ALLOW_WRITES);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout is the MCP transport channel.
  console.error(
    `cloudbeds-mcp started (base=${BASE_URL}, writes=${ALLOW_WRITES ? "on" : "off"})`,
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
