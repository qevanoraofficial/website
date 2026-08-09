"use client";

import { useEffect } from "react";

export default function ClientEffects() {
  useEffect(() => {
    let toastTimer;
    let revealObserver;
    let startTimer;

    const showToast = (message) => {
      const toast = document.getElementById("toast");
      if (!toast) return;
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
    };

    const handleClick = (event) => {
      const faqButton = event.target.closest(".faq-btn");
      if (faqButton) {
        const item = faqButton.parentElement;
        const content = item?.querySelector(".faq-content");
        const isOpen = item?.classList.contains("open");

        document.querySelectorAll(".faq-item").forEach((other) => {
          other.classList.remove("open");
          const otherContent = other.querySelector(".faq-content");
          if (otherContent) otherContent.style.maxHeight = "";
        });

        if (!isOpen && item && content) {
          item.classList.add("open");
          content.style.maxHeight = `${content.scrollHeight}px`;
        }
        return;
      }

      const buyButton = event.target.closest(".buy-btn");
      if (buyButton) {
        showToast(`${buyButton.dataset.product || "Produk"} dipilih. Hubungkan tombol ini ke checkout kamu.`);
        return;
      }

      const demoButton = event.target.closest("[data-demo-action]");
      if (demoButton) {
        showToast(demoButton.dataset.demoAction || "Fitur belum tersedia.");
      }
    };

    const handleSubmit = (event) => {
      if (event.target?.id !== "subscribeForm") return;
      event.preventDefault();
      const email = document.getElementById("emailInput");
      if (!email) return;
      showToast(`Terima kasih! ${email.value} berhasil didaftarkan.`);
      email.value = "";
    };

    const syncMobileNavViewportOffset = () => {
      const viewport = window.visualViewport;
      if (!viewport || window.innerWidth > 700) {
        document.documentElement.style.setProperty("--mobile-nav-viewport-offset", "0px");
        return;
      }

      const hiddenBottom = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
      );
      const safeOffset = hiddenBottom > 0 && hiddenBottom < 160 ? hiddenBottom : 0;
      document.documentElement.style.setProperty(
        "--mobile-nav-viewport-offset",
        `${safeOffset}px`
      );
    };

    // ITzpire-like reveal targets. Hero has its own first-load keyframes,
    // while the rest appears as it enters the viewport during scrolling.
    const selectorGroups = [
      ".brand-strip .strip-item",
      ".section-title > *",
      ".products-grid .product-card",
      ".feature-shell",
      ".features-grid .feature-card",
      ".promo",
      ".testimonials .quote",
      ".faq-list .faq-item",
      ".newsletter > *",
      ".page-content .review-summary",
      ".page-content .info-card",
      ".page-content .account-profile",
      ".page-content .account-panel",
      ".footer-brand",
      ".footer-col",
      ".copyright"
    ];

    const revealCandidates = Array.from(
      document.querySelectorAll(selectorGroups.join(","))
    );

    // Stagger siblings so text/cards appear one after another, like the reference.
    const groups = new Map();
    revealCandidates.forEach((element) => {
      const parent = element.parentElement || document.body;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(element);
    });

    groups.forEach((elements) => {
      elements.forEach((element, index) => {
        element.classList.add("qev-scroll-reveal");
        element.style.setProperty(
          "--qev-reveal-delay",
          `${Math.min(index * 90, 360)}ms`
        );
      });
    });

    const revealNow = (element) => {
      if (element.classList.contains("qev-visible")) return;
      element.classList.add("qev-visible");
      revealObserver?.unobserve(element);
    };

    // Two animation frames ensure the browser paints the hidden starting state
    // before adding qev-visible. This fixes the previous "no animation" behavior.
    const startRevealObserver = () => {
      if (!("IntersectionObserver" in window)) {
        revealCandidates.forEach(revealNow);
        return;
      }

      revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting || entry.intersectionRatio > 0) {
              revealNow(entry.target);
            }
          });
        },
        {
          threshold: 0.12,
          rootMargin: "0px 0px -7% 0px"
        }
      );

      revealCandidates.forEach((element) => revealObserver.observe(element));
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        startTimer = window.setTimeout(startRevealObserver, 40);
      });
    });

    document.addEventListener("click", handleClick);
    document.addEventListener("submit", handleSubmit);

    document.querySelectorAll("#year").forEach((el) => {
      el.textContent = String(new Date().getFullYear());
    });

    syncMobileNavViewportOffset();
    window.addEventListener("resize", syncMobileNavViewportOffset, { passive: true });
    window.visualViewport?.addEventListener("resize", syncMobileNavViewportOffset, { passive: true });
    window.visualViewport?.addEventListener("scroll", syncMobileNavViewportOffset, { passive: true });

    return () => {
      clearTimeout(toastTimer);
      clearTimeout(startTimer);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("submit", handleSubmit);
      window.removeEventListener("resize", syncMobileNavViewportOffset);
      window.visualViewport?.removeEventListener("resize", syncMobileNavViewportOffset);
      window.visualViewport?.removeEventListener("scroll", syncMobileNavViewportOffset);
      revealObserver?.disconnect();
      revealCandidates.forEach((element) => {
        element.classList.remove("qev-scroll-reveal", "qev-visible");
        element.style.removeProperty("--qev-reveal-delay");
      });
    };
  }, []);

  return null;
}
