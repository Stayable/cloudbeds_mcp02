"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [error, setError] = useState("");

  const input = { width: "100%", padding: 10, margin: "8px 0 16px", borderRadius: 6, border: "none", background: "#fff", color: "#041E42" } as const;
  const button = { width: "100%", padding: 12, background: "#FDDA24", color: "#041E42", border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer" } as const;

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    await fetch("/api/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    setStage("code");
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
    if (res.ok) router.push("/portfolio");
    else setError((await res.json().catch(() => ({}))).error ?? "Failed");
  }

  return (
    <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#041E42", color: "#fff", padding: 32, borderRadius: 12, width: 320 }}>
        <div style={{ color: "#FDDA24", fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>STAYABLE</div>
        {stage === "email" ? (
          <form onSubmit={sendCode}>
            <label style={{ fontSize: 12 }}>Work email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
            <button type="submit" style={button}>Send code</button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <label style={{ fontSize: 12 }}>6-digit code sent to {email}</label>
            <input inputMode="numeric" pattern="\d{6}" required value={code} onChange={(e) => setCode(e.target.value)} style={input} />
            <button type="submit" style={button}>Sign in</button>
            <button type="button" onClick={() => setStage("email")} style={{ ...button, background: "transparent", color: "#9bb", marginTop: 8, fontWeight: 400 }}>Use a different email</button>
          </form>
        )}
        {error && <p style={{ color: "#FDDA24", fontSize: 13, marginTop: 8 }}>{error}</p>}
      </div>
    </main>
  );
}
