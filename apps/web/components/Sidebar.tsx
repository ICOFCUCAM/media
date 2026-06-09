"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, ROLES, type Role } from "../lib/products";
import { useRole } from "./RoleContext";

/**
 * The studio's left navigation — outcomes, not engines. The
 * "System Administration" section is hidden unless the active role is Super
 * Admin, so creators never see GPU pools, queues, FFmpeg or model routing.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { role, setRole } = useRole();

  const sections = NAV.filter((s) => !s.adminOnly || role === "admin");

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-[#0a0a0f]">
      <Link href="/" className="block px-5 py-4 text-lg font-semibold tracking-tight">
        Cineforge
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-5">
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/35">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href || (item.href !== "/create" && pathname.startsWith(item.href + "/"));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-md px-2.5 py-1.5 text-sm transition ${
                      active
                        ? "bg-white/10 text-white"
                        : "text-white/60 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Role switcher — demonstrates Creator / Studio Owner / Super Admin views. */}
      <div className="border-t border-white/10 p-3">
        <div className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/35">
          Viewing as
        </div>
        <div className="flex gap-1 rounded-lg bg-white/5 p-1">
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRole(r.id as Role)}
              title={r.blurb}
              className={`flex-1 rounded-md px-1.5 py-1 text-[11px] transition ${
                role === r.id ? "bg-white text-black" : "text-white/60 hover:text-white"
              }`}
            >
              {r.label.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
