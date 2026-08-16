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
    pattern: /youtube/i,
    src: "/images/premium-apps/youtube-user.png",
  },
  {
    pattern: /\bvidio\b/i,
    src: "/images/premium-apps/vidio-user.png",
  },
  {
    pattern: /disney\s*\+?|disneyplus/i,
    src: "/images/premium-apps/disney-plus-user.png",
  },
  {
    pattern: /netflix/i,
    src: "/images/premium-apps/netflix-user.png",
  },
  {
    pattern: /gemini|chatgpt|openai/i,
    src: "/images/premium-apps/gemini-chatgpt-user.png",
  },
  {
    pattern: /iqiyi|wetv|youku|stv/i,
    src: "/images/premium-apps/asia-streaming-user.png",
  },
  {
    pattern: /hma\s*vpn|hide\s*my\s*ass/i,
    src: "/images/premium-apps/mystery-2026-user.png",
  },
  {
    pattern: /akses\s*drama\s*1\s*bulan|akses\s*drama\s*3\s*bulan|akses\s*drama/i,
    src: "/images/premium-apps/video-apps-bundle-user.png",
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
