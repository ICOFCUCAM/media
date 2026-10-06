"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { Role } from "../../lib/products";
import { useRole } from "../RoleContext";
import { Section } from "../cf/primitives";

export const VIEWS: { slug: "creator" | "studio" | "super"; role: Role; title: string; blurb: string }[] = [
  { slug: "creator", role: "creator", title: "Creator", blurb: "Your personal production environment." },
  { slug: "studio", role: "owner", title: "Studio", blurb: "The collaborative production house." },
  { slug: "super", role: "admin", title: "Super", blurb: "Full system administration and oversight." },
];

/**
 * "One system. Three ways of working." Entering a view sets the shell's role
 * (the same RoleContext the navigator's Viewing-as switch drives), and the
 * three contexts link to each other.
 */
export function ViewContext({ slug }: { slug: (typeof VIEWS)[number]["slug"] }) {
  const { setRole } = useRole();
  const here = VIEWS.find((v) => v.slug === slug)!;

  useEffect(() => {
    setRole(here.role);
    // Only on entering the view (setRole is recreated each render).
  }, [here.role]);

  return (
    <Section label="Context" title="One system. Three ways of working.">
      <div className="grid gap-px border border-cf-line bg-cf-line md:grid-cols-3">
        {VIEWS.map((v, i) => {
          const on = v.slug === slug;
          return (
            <Link
              key={v.slug}
              href={`/view/${v.slug}`}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-[150px] flex-col p-6 transition ${on ? "bg-cf-inverse text-cf-on-inverse" : "bg-cf-bg hover:bg-cf-soft"}`}
            >
              <span className="flex justify-between font-mono text-[9px] opacity-60">
                <span>{String(i + 1).padStart(2, "0")}</span>
                {on && <span className="text-cf-accent opacity-100">Current</span>}
              </span>
              <span className="mt-auto font-serif text-[30px] leading-none tracking-[-0.03em]">{v.title}</span>
              <span className="mt-2 text-[12px] opacity-60">{v.blurb}</span>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
