import { createMcpHandler } from "mcp-handler";
import { CloudbedsRegistry } from "@/lib/cloudbeds";
import { registerCloudbedsTools } from "@/lib/tools";

// The MCP SDK requires the Node.js runtime (not edge). Allow long tool calls.
export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOW_WRITES = process.env.CLOUDBEDS_ALLOW_WRITES === "true";

const mcpHandler = createMcpHandler(
  (server) => {
    const registry = CloudbedsRegistry.fromEnv();
    registerCloudbedsTools(server, registry, ALLOW_WRITES);
  },
  {},
  { basePath: "/api" },
);

/**
 * Shared-secret gate. This endpoint exposes PMS data over the public internet,
 * so every request must present `Authorization: Bearer <MCP_BEARER_TOKEN>`.
 * Fails closed: if no token is configured, the server refuses all requests.
 */
function withBearer(
  handler: (req: Request) => Promise<Response> | Response,
) {
  return async (req: Request): Promise<Response> => {
    const expected = process.env.MCP_BEARER_TOKEN;
    if (!expected) {
      return Response.json(
        { error: "Server not configured: MCP_BEARER_TOKEN is not set." },
        { status: 503 },
      );
    }
    const provided = req.headers.get("authorization");
    if (provided !== `Bearer ${expected}`) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
      );
    }
    return handler(req);
  };
}

const handler = withBearer(mcpHandler);

export { handler as GET, handler as POST, handler as DELETE };
