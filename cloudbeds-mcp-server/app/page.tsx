export default function Home() {
  return (
    <main style={{ maxWidth: 720, lineHeight: 1.6 }}>
      <h1 style={{ marginBottom: 0 }}>Cloudbeds MCP Server</h1>
      <p style={{ color: "#9aa4b2", marginTop: 4 }}>
        RISE8 / Stayable · remote Model Context Protocol endpoint
      </p>
      <p>
        This is a machine endpoint, not a website. Connect an MCP client to{" "}
        <code style={{ background: "#1c2230", padding: "2px 6px", borderRadius: 4 }}>
          /api/mcp
        </code>{" "}
        with a bearer token. See the repo README for setup.
      </p>
      <p style={{ color: "#9aa4b2", fontSize: 14 }}>
        Tools cover reservations, occupancy, guests, availability, rooms, rates,
        and (when enabled) payments &amp; status changes.
      </p>
    </main>
  );
}
