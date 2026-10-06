"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NAV, ROLES, type NavSection, type Role } from "../../lib/products";
import { msToCredits } from "../../lib/plans";
import { useRole } from "../RoleContext";
import { useAuth } from "../AuthProvider";
import { AuthCard } from "../AuthCard";
import { FAMILY_CODE, crumbsFor, isActive, locate, roomFor } from "./nav";

/*
 * The Cineforge studio shell (docs/design: rail + navigator + topbar).
 *   rail       — production families, always the institution's black
 *   navigator  — the pages of the active family (desktop)
 *   topbar     — breadcrumb, credits, account; opens the full index on mobile
 * Pages render inside the room their design calls for (paper or dark).
 */
export function CineforgeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const { role } = useRole();
  const [drawer, setDrawer] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  // The rail only offers the admin family in the Super view, but a page is
  // always located against the full NAV so an /admin URL keeps its breadcrumb
  // and navigator (the page itself shows the restricted state).
  const sections = NAV.filter((s) => !s.adminOnly || role === "admin");
  const here = locate(pathname, NAV);
  const room = roomFor(pathname);

  // Close the mobile index whenever the route changes.
  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className={`cf-${room} flex h-screen overflow-hidden`}>
      <a href="#cf-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:bg-cf-inverse focus:px-4 focus:py-2 focus:text-cf-on-inverse">
        Skip to workspace
      </a>
      <Rail sections={sections} active={here?.section.title} />
      {here && <Navigator section={here.section} pathname={pathname} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar crumbs={crumbsFor(pathname)} onMenu={() => setDrawer(true)} menuRef={menuRef} />
        <main id="cf-main" className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      {drawer && (
        <Drawer
          sections={sections}
          pathname={pathname}
          onClose={() => {
            setDrawer(false);
            // Hand focus back to the control that opened the index.
            requestAnimationFrame(() => menuRef.current?.focus());
          }}
        />
      )}
    </div>
  );
}

/* ── Rail ─────────────────────────────────────────────────────── */

function Rail({ sections, active }: { sections: NavSection[]; active?: string }) {
  return (
    <aside className="hidden w-[78px] shrink-0 flex-col items-center bg-[#10110f] text-[#f4f1ea] md:flex" aria-label="Production families">
      <Link href="/" aria-label="Cineforge home" className="flex h-[78px] w-full items-center justify-center border-b border-white/10">
        <span className="relative h-[22px] w-[22px] rotate-45 border border-[#f4f1ea]">
          <span className="absolute left-[6px] top-[6px] h-2 w-2 bg-[#b7ff3c]" />
        </span>
      </Link>
      <nav className="flex flex-col items-center gap-2 pt-5">
        {sections.map((s) => {
          const on = s.title === active;
          return (
            <Link
              key={s.title}
              href={s.items[0]?.href ?? "/"}
              title={s.title}
              aria-label={s.title}
              aria-current={on ? "true" : undefined}
              className={`group flex h-[52px] w-[52px] flex-col items-center justify-center gap-1 border transition ${
                on ? "border-white/20 bg-white/[0.06] text-white" : "border-transparent text-[#85867f] hover:text-white"
              }`}
            >
              <FamilyIcon title={s.title} />
              <span className="font-mono text-[8px] tracking-[0.12em]">{FAMILY_CODE[s.title] ?? s.title.slice(0, 2).toUpperCase()}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto pb-6">
        <span className="block h-2 w-2 rounded-full bg-[#b7ff3c]" aria-hidden />
      </div>
    </aside>
  );
}

function FamilyIcon({ title }: { title: string }) {
  const d: Record<string, ReactNode> = {
    Studio: <path d="M12 5v14M5 12h14" />,
    Production: (
      <>
        <rect x="4" y="5" width="16" height="14" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),
    Publishing: (
      <>
        <path d="M5 19 19 5" />
        <path d="M8 5h11v11" />
      </>
    ),
    Account: (
      <>
        <rect x="4" y="7" width="16" height="11" />
        <path d="M4 11h16" />
      </>
    ),
    Analytics: <path d="M5 19V10M12 19V5M19 19v-7" />,
    Enterprise: (
      <>
        <path d="M5 20V8l7-4 7 4v12" />
        <path d="M9 20v-5h6v5" />
      </>
    ),
    View: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
      </>
    ),
    "System Administration": (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      {d[title] ?? <rect x="5" y="5" width="14" height="14" />}
    </svg>
  );
}

/* ── Navigator ────────────────────────────────────────────────── */

function Navigator({ section, pathname }: { section: NavSection; pathname: string }) {
  const { role, setRole } = useRole();
  const { profile } = useAuth();
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col border-r border-cf-line bg-cf-soft/40 lg:flex" aria-label={`${section.title} pages`}>
      <div className="flex h-[78px] items-end border-b border-cf-line px-6 pb-5">
        <div>
          <div className="cf-label">Cineforge</div>
          <div className="mt-1 font-serif text-[22px] leading-none tracking-[-0.03em]">{section.title}</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {section.items.map((item, i) => {
          const on = isActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className={`grid grid-cols-[26px_1fr] items-center px-3 py-2.5 text-[12px] transition ${
                on ? "bg-cf-inverse text-cf-on-inverse" : "text-cf-muted hover:bg-cf-soft hover:text-cf-fg"
              }`}
            >
              <span className={`font-mono text-[9px] ${on ? "opacity-60" : "text-cf-dim"}`}>{String(i + 1).padStart(2, "0")}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {profile && (
        <Link href="/pricing" className="mx-3 mb-3 flex items-center justify-between border border-cf-line px-3 py-3 transition hover:border-cf-fg">
          <span className="cf-label">Credits</span>
          <span className="font-mono text-[11px]">{msToCredits(profile.creditsMs).toLocaleString()}</span>
        </Link>
      )}

      <div className="border-t border-cf-line p-3">
        <div className="cf-label px-1 pb-2">Viewing as</div>
        <div className="grid grid-cols-3 border border-cf-line" role="group" aria-label="Viewing as">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRole(r.id as Role)}
              title={r.blurb}
              aria-pressed={role === r.id}
              className={`py-2 font-mono text-[9px] uppercase tracking-[0.08em] transition ${
                role === r.id ? "bg-cf-inverse text-cf-on-inverse" : "text-cf-muted hover:text-cf-fg"
              }`}
            >
              {r.id === "owner" ? "Studio" : r.id === "admin" ? "Super" : "Creator"}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

/* ── Topbar ───────────────────────────────────────────────────── */

function Topbar({ crumbs, onMenu, menuRef }: { crumbs: string[]; onMenu: () => void; menuRef: React.RefObject<HTMLButtonElement> }) {
  return (
    <header className="flex h-[64px] shrink-0 items-center justify-between gap-4 border-b border-cf-line bg-cf-bg px-5 sm:px-8 lg:h-[78px] lg:px-10">
      <div className="flex min-w-0 items-center gap-4">
        <button ref={menuRef} type="button" onClick={onMenu} className="cf-btn-line px-3 py-2 lg:hidden" aria-label="Open the studio index" aria-haspopup="dialog">
          Index
        </button>
        <nav aria-label="Breadcrumb" className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-cf-muted">
          <Link href="/" className="hover:text-cf-fg">Cineforge</Link>
          {crumbs.map((c, i) => (
            <span key={c}>
              <span className="mx-2.5">/</span>
              {i === crumbs.length - 1 ? <strong className="font-medium text-cf-fg">{c}</strong> : c}
            </span>
          ))}
        </nav>
      </div>
      <Account />
    </header>
  );
}

function Account() {
  const { enabled, user, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (!enabled) {
    return (
      <span className="hidden font-mono text-[9px] uppercase tracking-[0.1em] text-cf-muted sm:inline" title="Set NEXT_PUBLIC_SUPABASE_URL to persist work">
        Preview studio
      </span>
    );
  }

  if (!user) {
    return (
      <div className="relative">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="cf-btn-ink px-4 py-2.5">
          Sign in
        </button>
        {open && (
          <div className="absolute right-0 top-full z-50 mt-3 w-[min(380px,calc(100vw-40px))] shadow-[0_30px_80px_rgba(0,0,0,.25)]">
            <AuthCard />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 sm:gap-5">
      {profile && (
        <Link href="/pricing" className="hidden font-mono text-[9px] uppercase tracking-[0.1em] text-cf-muted hover:text-cf-fg sm:inline lg:hidden xl:inline">
          {profile.tier} · {msToCredits(profile.creditsMs).toLocaleString()} credits
        </Link>
      )}
      <span className="hidden max-w-[200px] truncate text-[12px] text-cf-muted md:inline">{user.email}</span>
      <button type="button" onClick={() => void signOut()} className="cf-btn-line px-3 py-2">
        Sign out
      </button>
    </div>
  );
}

/* ── Mobile index ─────────────────────────────────────────────── */

function Drawer({ sections, pathname, onClose }: { sections: NavSection[]; pathname: string; onClose: () => void }) {
  const { role, setRole } = useRole();
  const { profile } = useAuth();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex lg:hidden" role="dialog" aria-modal="true" aria-label="Studio index">
      <div className="flex w-full max-w-[420px] flex-col overflow-y-auto bg-cf-bg">
        <div className="flex h-[64px] items-center justify-between border-b border-cf-line px-5">
          <Link href="/" className="font-display text-[16px] font-extrabold tracking-[-0.04em]">CINEFORGE</Link>
          <button type="button" onClick={onClose} className="cf-btn-line px-3 py-2" autoFocus>
            Close
          </button>
        </div>
        <nav className="px-5 py-4">
          {sections.map((s) => (
            <div key={s.title} className="border-b border-cf-line py-4">
              <div className="cf-label mb-2">{s.title}</div>
              {s.items.map((item) => {
                const on = isActive(item, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={on ? "page" : undefined}
                    className={`block py-2 font-serif text-[20px] tracking-[-0.02em] ${on ? "text-cf-fg" : "text-cf-muted"}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto border-t border-cf-line px-5 py-5">
          {profile && (
            <Link href="/pricing" className="mb-4 flex items-center justify-between border border-cf-line px-3 py-3">
              <span className="cf-label">Credits · {profile.tier}</span>
              <span className="font-mono text-[11px]">{msToCredits(profile.creditsMs).toLocaleString()}</span>
            </Link>
          )}
          <div className="cf-label pb-2">Viewing as</div>
          <div className="grid grid-cols-3 border border-cf-line" role="group" aria-label="Viewing as">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id as Role)}
                aria-pressed={role === r.id}
                className={`py-2.5 font-mono text-[9px] uppercase tracking-[0.08em] ${role === r.id ? "bg-cf-inverse text-cf-on-inverse" : "text-cf-muted"}`}
              >
                {r.id === "owner" ? "Studio" : r.id === "admin" ? "Super" : "Creator"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button type="button" aria-label="Close the studio index" className="flex-1 bg-black/50" onClick={onClose} />
    </div>
  );
}
