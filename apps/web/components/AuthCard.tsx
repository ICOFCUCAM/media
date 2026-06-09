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
    <div className="mx-auto max-w-sm rounded-xl border border-white/10 bg-white/[0.02] p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-white/55">
        {mode === "in" ? "Welcome back." : "Create an account to save your films."}
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@studio.com"
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-sm outline-none focus:border-white/30"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (6+ chars)"
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-sm outline-none focus:border-white/30"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
        >
          {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>
      {msg && <p className="mt-3 text-xs text-amber-300">{msg}</p>}
      <button
        onClick={() => {
          setMode(mode === "in" ? "up" : "in");
          setMsg(null);
        }}
        className="mt-4 text-xs text-white/50 hover:text-white"
      >
        {mode === "in" ? "Need an account? Sign up" : "Have an account? Sign in"}
      </button>
    </div>
  );
}
