"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A create panel that steps aside once there is a collection: open while the
 * library is empty (the form is the next step), collapsed to a single bar when
 * there is work to look at — the collection leads, creation is one click away.
 */
export function Composer({ label, count, children }: { label: string; count: number | null; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const decided = useRef(false);
  // Open by default only for an empty library — decided once, when the list loads.
  useEffect(() => {
    if (count === null || decided.current) return;
    decided.current = true;
    setOpen(count === 0);
  }, [count]);

  return (
    <div className="mb-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-lg border px-5 py-4 text-left transition ${
          open ? "border-cf-line bg-cf-panel" : "border-cf-line2 hover:border-cf-fg hover:bg-cf-soft"
        }`}
      >
        <span className="flex items-center gap-3">
          <span className={`grid h-7 w-7 place-items-center rounded-full text-[16px] leading-none transition ${open ? "bg-cf-soft text-cf-muted" : "bg-cf-accent text-[#10100f]"}`} aria-hidden>
            {open ? "−" : "+"}
          </span>
          <span className="font-display text-[17px] font-semibold">{label}</span>
        </span>
        <span className="text-[12px] text-cf-muted">{open ? "Close" : "Open"}</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
