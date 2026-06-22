"use client";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/auth/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSent(true);
  }

  return (
    <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#041E42", color: "#fff", padding: 32, borderRadius: 12, width: 320 }}>
        <div style={{ color: "#FDDA24", fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>STAYABLE</div>
        {sent ? (
          <p>Check your email for a sign-in link.</p>
        ) : (
          <form onSubmit={submit}>
            <label style={{ fontSize: 12 }}>Work email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: 10, margin: "8px 0 16px", borderRadius: 6, border: "none", background: "#fff", color: "#041E42" }}
            />
            <button
              type="submit"
              style={{ width: "100%", padding: 12, background: "#FDDA24", color: "#041E42", border: "none", borderRadius: 6, fontWeight: 700 }}
            >
              Send sign-in link
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
