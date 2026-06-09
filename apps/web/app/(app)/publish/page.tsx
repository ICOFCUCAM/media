"use client";

import { useState } from "react";
import { SOCIAL_CHANNELS } from "../../../lib/products";

export default function PublishPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set(SOCIAL_CHANNELS.map((c) => c.id)));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Publish Everywhere</h1>
        <p className="mt-1 text-sm text-white/55">
          Pick a title and send it to every platform at once — each gets the right aspect ratio, length and caption.
        </p>
      </header>

      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={() => setSelected(new Set(SOCIAL_CHANNELS.map((c) => c.id)))}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5"
        >
          Select all
        </button>
        <button
          onClick={() => setSelected(new Set())}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5"
        >
          Clear
        </button>
        <span className="text-xs text-white/40">{selected.size} of {SOCIAL_CHANNELS.length} selected</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SOCIAL_CHANNELS.map((c) => {
          const on = selected.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition ${
                on ? "border-white/30 bg-white/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <span>
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-[10px] uppercase tracking-wider text-white/35">{c.kind}</span>
              </span>
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs ${
                  on ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-300" : "border-white/20 text-transparent"
                }`}
              >
                ✓
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div>
          <div className="font-medium">Ready to go live on {selected.size} platform{selected.size === 1 ? "" : "s"}</div>
          <p className="text-sm text-white/50">Connect accounts once; re-publish any title in a single click.</p>
        </div>
        <button
          disabled={selected.size === 0}
          className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-40"
        >
          Publish
        </button>
      </div>
    </div>
  );
}
