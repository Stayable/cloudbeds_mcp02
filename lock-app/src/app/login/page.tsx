"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [error, setError] = useState("");
  // The request takes a moment and the button used to look untouched, so people
  // pressed it again — sending a second code and two emails at once. Hold the
  // submit until the round-trip finishes.
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await fetch("/api/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      setStage("code");
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
      if (res.ok) router.push("/portfolio");
      else setError((await res.json().catch(() => ({}))).error ?? "That code didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", background: "var(--navy)", alignItems: "stretch" }}>
      <div style={{ margin: "auto", width: "100%", maxWidth: 980, display: "flex", borderRadius: 16, overflow: "hidden", boxShadow: "0 40px 100px -30px rgba(0,0,0,.6)" }}>
        {/* navy panel */}
        <div className="login-aside" style={{ flex: 1, minWidth: 0, background: "linear-gradient(160deg,#062a5c 0%,#041E42 70%)", padding: "48px 44px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <img src="/brand/stayable-wordmark-white.png" alt="Stayable" style={{ width: 148, display: "block" }} />
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,40px)", gap: 14, marginBottom: 28 }}>
              <span style={{ width: 40, height: 40, borderRadius: 9, background: "var(--gold)" }} />
              <span style={{ width: 40, height: 40, borderRadius: 9, background: "rgba(255,255,255,.10)" }} />
              <span style={{ width: 40, height: 40, borderRadius: 9, background: "rgba(255,255,255,.10)" }} />
              <span style={{ width: 40, height: 40, borderRadius: 9, background: "var(--blue)" }} />
            </div>
            <div className="display" style={{ color: "#fff", fontSize: 30, fontWeight: 600, lineHeight: 1.15, letterSpacing: "-.01em", maxWidth: 320 }}>Access control for every door you manage.</div>
            <div style={{ color: "var(--on-navy)", fontSize: 15, lineHeight: 1.5, marginTop: 14, maxWidth: 340 }}>8 properties. Every lock, code, and check-in — in one place.</div>
          </div>
          <div className="mono" style={{ color: "var(--on-navy-label)", fontSize: 11, fontWeight: 500, letterSpacing: ".05em" }}>RISE8 · STAYABLE OPS</div>
        </div>
        {/* form panel */}
        <div style={{ flex: "0 0 380px", maxWidth: "48%", background: "#fff", padding: "48px 40px", display: "flex", flexDirection: "column", justifyContent: "center" }} className="login-form">
          <div className="display" style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)" }}>Sign in</div>
          {stage === "email" ? (
            <form onSubmit={sendCode}>
              <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 6 }}>We&apos;ll email you a one-time code.</p>
              <label className="lbl" style={{ margin: "26px 0 8px" }}>WORK EMAIL</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field" style={{ width: "100%", height: 46 }} placeholder="you@rentstayable.com" />
              <button type="submit" disabled={busy} className="btn btn-primary" style={{ marginTop: 14, width: "100%", height: 46, opacity: busy ? 0.65 : 1, cursor: busy ? "default" : "pointer" }}>{busy ? "Sending…" : "Send code"}</button>
            </form>
          ) : (
            <form onSubmit={verify}>
              <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 6 }}>Enter the 6-digit code sent to {email}.</p>
              <label className="lbl" style={{ margin: "26px 0 8px" }}>6-DIGIT CODE</label>
              <input inputMode="numeric" pattern="\d{6}" required value={code} onChange={(e) => setCode(e.target.value)} className="field mono" style={{ width: "100%", height: 52, fontSize: 22, letterSpacing: ".3em", textAlign: "center" }} />
              <button type="submit" disabled={busy} className="btn btn-navy" style={{ marginTop: 16, width: "100%", height: 46, opacity: busy ? 0.65 : 1, cursor: busy ? "default" : "pointer" }}>{busy ? "Checking…" : "Verify & continue"}</button>
              <button type="button" onClick={() => setStage("email")} className="btn btn-ghost" style={{ marginTop: 8, width: "100%", height: 42, border: "none" }}>Use a different email</button>
            </form>
          )}
          {error && <p style={{ color: "var(--crit-ink)", fontSize: 13, marginTop: 12 }}>{error}</p>}
        </div>
      </div>
    </main>
  );
}
