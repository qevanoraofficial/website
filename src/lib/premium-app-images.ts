const PREMIUM_APP_IMAGES: Array<{ pattern: RegExp; src: string }> = [
  {
    pattern: /\bviu\b/i,
    src: "/images/premium-apps/viu.svg",
  },
  {
    pattern: /alight\s*motion|alightmotion/i,
    src: "/images/premium-apps/alight-motion-user.svg",
  },
  {
    pattern: /\bcanva\b/i,
    src: "/images/premium-apps/canva-user.svg",
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
