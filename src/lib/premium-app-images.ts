const PREMIUM_APP_IMAGES: Array<{ pattern: RegExp; src: string }> = [
  {
    pattern: /\bwinks?\b/i,
    src: "/images/premium-apps/winks-user.png",
  },
  {
    pattern: /cap\s*cut|capcut/i,
    src: "/images/premium-apps/capcut-user.png",
  },
  {
    pattern: /spotify|spootify/i,
    src: "/images/premium-apps/spotify-user.png",
  },
  {
    pattern: /prime\s*video|primevidio|prime\s*vidio/i,
    src: "/images/premium-apps/prime-video-user.png",
  },
  {
    pattern: /redeem\s*nitro|discord\s*nitro|nitro/i,
    src: "/images/premium-apps/redeem-nitro-user.png",
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
