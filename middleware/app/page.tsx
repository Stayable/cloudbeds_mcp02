export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640 }}>
      <h1>Stayable Lock Middleware</h1>
      <p>
        Headless service. No UI here — see the <code>lock-app</code> project for the
        management console.
      </p>
      <ul>
        <li>
          <code>GET /api/ttlock-test</code> — TTLock credential + lock-visibility probe
        </li>
        <li>
          <code>POST /api/cloudbeds-webhook</code> — reservation event handler (Phase 4)
        </li>
      </ul>
    </main>
  );
}
