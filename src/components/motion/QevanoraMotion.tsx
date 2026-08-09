"use client";

import { useEffect } from "react";

const REVEAL_SELECTOR = [
  "main section",
  "main article",
  "main footer",
  ".qevanora-card",
  "[data-qev-motion]",
  ".rounded-2xl.border",
  ".rounded-3xl.border",
].join(",");

export default function QevanoraMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    root.classList.add("qev-motion-ready");
    body.classList.add("qev-page-enter");

    let frame = 0;
    const updateScrollProgress = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        const max = Math.max(
          document.documentElement.scrollHeight - window.innerHeight,
          1,
        );
        const progress = Math.min(Math.max(window.scrollY / max, 0), 1);
        root.style.setProperty("--qev-scroll-progress", String(progress));
        frame = 0;
      });
    };

    updateScrollProgress();
    window.addEventListener("scroll", updateScrollProgress, { passive: true });

    if (reduceMotion || typeof IntersectionObserver === "undefined") {
      root.classList.add("qev-reduced-motion");
      document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((element) => {
        element.classList.add("qev-in-view");
      });

      return () => {
        window.removeEventListener("scroll", updateScrollProgress);
        if (frame) window.cancelAnimationFrame(frame);
        root.classList.remove("qev-motion-ready", "qev-reduced-motion");
        body.classList.remove("qev-page-enter");
      };
    }

    const seen = new WeakSet<Element>();
    let sequence = 0;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target as HTMLElement;
          element.classList.add("qev-in-view");
          observer.unobserve(element);
        });
      },
      {
        threshold: 0.08,
        rootMargin: "0px 0px -7% 0px",
      },
    );

    const register = (scope: ParentNode = document) => {
      scope.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((element) => {
        if (seen.has(element)) return;
        seen.add(element);

        // Skip small utility elements that happen to match generic rounded/border selectors.
        if (element.closest("header") || element.closest("aside")) return;

        element.classList.add("qev-scroll-reveal");
        element.style.setProperty("--qev-reveal-delay", `${(sequence % 6) * 55}ms`);
        sequence += 1;
        observer.observe(element);
      });
    };

    register();

    const mutations = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (node.matches(REVEAL_SELECTOR)) {
              register(node.parentElement ?? document);
            } else {
              register(node);
            }
          }
        });
      });
    });

    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
      window.removeEventListener("scroll", updateScrollProgress);
      if (frame) window.cancelAnimationFrame(frame);
      root.classList.remove("qev-motion-ready");
      body.classList.remove("qev-page-enter");
    };
  }, []);

  return (
    <>
      <div className="qev-scroll-progress" aria-hidden="true" />
      <div className="qev-ambient qev-ambient-one" aria-hidden="true" />
      <div className="qev-ambient qev-ambient-two" aria-hidden="true" />
    </>
  );
}
