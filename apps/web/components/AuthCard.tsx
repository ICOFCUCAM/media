"use client";

import { useState } from "react";
import { useAuth } from "./AuthProvider";

/** Compact email/password sign-in card shown when a creator action needs auth. */
export function AuthCard({ title = "Sign in to your studio" }: { title?: string }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const fn = mode === "in" ? signIn : signUp;
    const { error } = await fn(email, password);
    setBusy(false);
    if (error) setMsg(error);
    else if (mode === "up") setMsg("Check your email to confirm, then sign in.");
  }

  return (
    <div className="mx-auto w-full max-w-sm border border-cf-line bg-cf-bg p-7 text-cf-fg">
      <div className="cf-label">{mode === "in" ? "Studio access" : "New studio"}</div>
      <h2 className="cf-display mt-4 text-[30px] leading-none">{title}</h2>
      <p className="mt-2 text-[13px] text-cf-muted">{mode === "in" ? "Welcome back." : "Create an account to save your productions."}</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <label className="block">
          <span className="cf-label">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@studio.com"
            className="cf-input mt-2"
          />
        </label>
        <label className="block">
          <span className="cf-label">Password</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6+ characters"
            className="cf-input mt-2"
          />
        </label>
        <button type="submit" disabled={busy} className="cf-btn-ink mt-2 w-full">
          {busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>
      {msg && (
        <p role="status" className="mt-4 border-l-2 border-cf-warn pl-3 text-[12px] text-cf-warn">
          {msg}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setMsg(null);
        }}
        className="cf-link mt-5 text-cf-muted hover:text-cf-fg"
      >
        {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
    </div>
  );
}
