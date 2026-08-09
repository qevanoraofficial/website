"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const GENERIC_SELECTOR = "main section, main article, main footer";

export default function QevanoraMotion() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    root.classList.add("qev-itz-motion-ready");

    // The homepage owns its more detailed stagger animation. This observer is
    // only a fallback for the other pages so the same scroll rhythm is kept.
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(GENERIC_SELECTOR),
    ).filter((element) => !element.closest(".qev-reference-reveal"));

    if (reduceMotion || typeof IntersectionObserver === "undefined") {
      candidates.forEach((element) => element.classList.add("qev-itz-in"));
      return () => root.classList.remove("qev-itz-motion-ready");
    }

    candidates.forEach((element) => element.classList.add("qev-itz-reveal"));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target as HTMLElement;
          element.classList.add("qev-itz-in");
          observer.unobserve(element);
        });
      },
      {
        threshold: 0.14,
        rootMargin: "0px 0px -7% 0px",
      },
    );

    candidates.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      root.classList.remove("qev-itz-motion-ready");
    };
  }, [pathname]);

  return null;
}
