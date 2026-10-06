"use client";

import { useEffect } from "react";

/**
 * Homepage motion — reveal-on-scroll for every `.reveal` block and a very
 * subtle mouse parallax on the hero image. Respects prefers-reduced-motion.
 */
export function HomeMotion() {
  useEffect(() => {
    // Close the phone/tablet menu once a section link is chosen.
    const menu = document.querySelector<HTMLDetailsElement>(".cfh .nav-menu");
    const closeMenu = (e: Event) => {
      if (menu && (e.target as HTMLElement).closest(".nav-menu-panel a")) menu.open = false;
    };
    menu?.addEventListener("click", closeMenu);

    const reveals = document.querySelectorAll<HTMLElement>(".cfh .reveal");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      reveals.forEach((el) => el.classList.add("visible"));
      return () => menu?.removeEventListener("click", closeMenu);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    reveals.forEach((el) => observer.observe(el));

    const heroImage = document.querySelector<HTMLElement>(".cfh .hero-image");
    const onMove = (e: MouseEvent) => {
      if (!heroImage) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 8;
      const y = (e.clientY / window.innerHeight - 0.5) * 5;
      heroImage.style.transform = `translate(${x}px, ${y}px) scale(1.02)`;
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("mousemove", onMove);
      menu?.removeEventListener("click", closeMenu);
    };
  }, []);

  return null;
}
