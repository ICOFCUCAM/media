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

    // Stills fade in as they finish loading (no pop); ones already loaded show at once.
    const stills = [...document.querySelectorAll<HTMLImageElement>(".cfh img.still-fill")];
    const shown = (img: HTMLImageElement) => img.setAttribute("data-loaded", "");
    stills.forEach((img) => (img.complete ? shown(img) : img.addEventListener("load", () => shown(img), { once: true })));
    document.documentElement.classList.add("cfh-js");

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
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Figures count up once, the first time they are seen.
    const counters = document.querySelectorAll<HTMLElement>(".cfh [data-count]");
    const counted = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        counted.unobserve(entry.target);
        const el = entry.target as HTMLElement;
        const to = Number(el.dataset.count);
        if (reduced || !Number.isFinite(to)) return;
        const t0 = performance.now();
        const tick = (t: number) => {
          const k = Math.min(1, (t - t0) / 1400);
          el.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
          if (k < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.6 });
    counters.forEach((el) => counted.observe(el));

    if (reduced) {
      reveals.forEach((el) => el.classList.add("visible"));
      return () => {
        counted.disconnect();
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
      counted.disconnect();
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
