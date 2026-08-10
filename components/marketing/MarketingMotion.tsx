"use client";

import { useEffect } from "react";

export default function MarketingMotion() {
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealItems = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (reduced) { revealItems.forEach((item) => item.classList.add("is-visible")); return; }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }), { rootMargin: "0px 0px -10%", threshold: .12 });
    revealItems.forEach((item) => observer.observe(item));
    let frame = 0;
    const hero = document.querySelector<HTMLElement>(".mk-hero-frame");
    const update = () => { frame = 0; if (hero) hero.style.setProperty("--hero-shift", `${Math.min(56, scrollY * .08)}px`); };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    addEventListener("scroll", onScroll, { passive: true });
    return () => { observer.disconnect(); removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, []);
  return null;
}
