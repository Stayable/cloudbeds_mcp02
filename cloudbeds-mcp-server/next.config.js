/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // mcp-handler and the MCP SDK run on the Node.js runtime, not the edge.
    serverComponentsExternalPackages: ["mcp-handler", "@modelcontextprotocol/sdk"],
  },
};

module.exports = nextConfig;
