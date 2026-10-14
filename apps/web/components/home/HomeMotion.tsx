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

    // Once the page leaves the hero, the nav becomes a solid glass bar so it
    // never smears over the cream sections.
    const nav = document.querySelector<HTMLElement>(".cfh .nav");
    const onNav = () => nav?.classList.toggle("is-scrolled", window.scrollY > 60);
    onNav();
    window.addEventListener("scroll", onNav, { passive: true });

    // Scroll-spy: the nav marks the section being read.
    const links = [...document.querySelectorAll<HTMLAnchorElement>(".cfh .nav-center a[href^='#']")];
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === `#${entry.target.id}`));
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    links.forEach((a) => {
      const target = document.querySelector(a.getAttribute("href")!);
      if (target) spy.observe(target);
    });
    const hero = document.querySelector(".cfh .hero");
    const clearSpy = () => { if (window.scrollY < (hero?.clientHeight ?? 600) * 0.6) links.forEach((a) => a.classList.remove("is-active")); };
    window.addEventListener("scroll", clearSpy, { passive: true });

    const reveals = document.querySelectorAll<HTMLElement>(".cfh .reveal");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      reveals.forEach((el) => el.classList.add("visible"));
      return () => {
        spy.disconnect();
        window.removeEventListener("scroll", clearSpy);
        menu?.removeEventListener("click", closeMenu);
        window.removeEventListener("scroll", onNav);
      };
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
    // The picture behind the frame drifts a little against the pointer: depth, not motion.
    const heroBleed = document.querySelector<HTMLElement>(".cfh .hero-bleed");
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5);
      const y = (e.clientY / window.innerHeight - 0.5);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (heroImage) heroImage.style.transform = `translate(${x * 8}px, ${y * 5}px) scale(1.02)`;
        if (heroBleed && window.scrollY < window.innerHeight) heroBleed.style.translate = `${x * -14}px ${y * -8}px`;
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });

    return () => {
      observer.disconnect();
      spy.disconnect();
      window.removeEventListener("scroll", clearSpy);
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      menu?.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", onNav);
    };
  }, []);

  return null;
}
