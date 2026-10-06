import { NAV, type NavItem, type NavSection } from "../../lib/products";

/*
 * Route model for the studio shell. NAV (lib/products) stays the single source
 * of truth for what exists; this file only answers "where am I?" questions.
 */

export type Room = "light" | "dark";

/** Short codes shown on the rail, per NAV section title. */
export const FAMILY_CODE: Record<string, string> = {
  Studio: "ST",
  Production: "PR",
  Publishing: "PB",
  Account: "AC",
  Analytics: "AN",
  Enterprise: "EN",
  View: "VW",
  "System Administration": "SY",
};

const pathOf = (href: string) => href.split(/[?#]/)[0];

/** True when `item` is the page at `pathname` (or a parent of it). */
export function isActive(item: NavItem, pathname: string): boolean {
  const p = pathOf(item.href);
  if (item.href.includes("#")) return false; // in-page anchors never own a route
  return pathname === p || (p !== "/create" && pathname.startsWith(p + "/"));
}

export function locate(pathname: string, sections: NavSection[] = NAV): { section: NavSection; item: NavItem | null } | null {
  for (const section of sections) {
    const item = section.items.find((i) => isActive(i, pathname));
    if (item) return { section, item };
  }
  // Pages that sit below a section without a nav entry of their own.
  if (pathname.startsWith("/admin")) {
    const section = sections.find((s) => s.adminOnly);
    if (section) return { section, item: null };
  }
  return null;
}

/** Breadcrumb trail after "CINEFORGE". */
export function crumbsFor(pathname: string): string[] {
  const hit = locate(pathname);
  if (!hit) return [];
  const trail = [hit.section.title];
  if (hit.item) trail.push(hit.item.label);
  if (pathname.startsWith("/projects/")) trail.push("Production file");
  return trail;
}

/**
 * Which room a page lives in (docs/design): production rooms are dark, the
 * editorial studio is paper.
 */
const DARK_ROOMS = ["/library/characters", "/library/worlds", "/library/assets", "/projects/"];

export function roomFor(pathname: string): Room {
  return DARK_ROOMS.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/")))
    ? "dark"
    : "light";
}
