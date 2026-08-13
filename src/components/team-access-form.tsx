"use client";

import { useEffect, useState } from "react";

export function TeamAccessForm() {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("Use the private access link shared with you.");
  const [working, setWorking] = useState(false);

  async function signIn(value: string) {
    if (!value.trim()) return;
    setWorking(true);
    try {
      const response = await fetch("/api/team-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: value.trim() })
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Private sign-in failed");
      window.location.replace("/sunday");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Private sign-in failed");
      setWorking(false);
    }
  }

  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!value) return;
    window.history.replaceState(null, "", window.location.pathname);
    const timer = window.setTimeout(() => { void signIn(value); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <>
    <p>{working ? "Verifying private access…" : message}</p>
    <form onSubmit={(event) => { event.preventDefault(); void signIn(token); }}>
      <label>Access code<input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="one-time-code" required /></label>
      <button type="submit" disabled={working}>{working ? "Verifying…" : "Open shared board"}</button>
    </form>
  </>;
}
