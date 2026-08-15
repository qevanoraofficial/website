const PREMIUM_APP_IMAGES: Array<{ pattern: RegExp; src: string }> = [
  {
    pattern: /\bwinks?\b/i,
    src: "/images/premium-apps/winks-user.png",
  },
  {
    pattern: /\bviu\b/i,
    src: "/images/premium-apps/viu-user.png",
  },
  {
    pattern: /alight\s*motion|alightmotion/i,
    src: "/images/premium-apps/alight-motion-user.png",
  },
  {
    pattern: /\bcanva\b/i,
    src: "/images/premium-apps/canva-user.png",
  },
];

export function getPremiumAppImage(productName: string, currentImage?: string) {
  const existing = String(currentImage || "").trim();
  if (existing && !existing.endsWith("/product-placeholder.svg")) {
    return existing;
  }

  const mapped = PREMIUM_APP_IMAGES.find(({ pattern }) => pattern.test(productName));
  return mapped?.src || "/images/premium-apps/default.svg";
}
