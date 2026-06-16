import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // AVIF 우선(WebP 대비 ~30% 더 작음) → 카드(원격 Steam) 이미지 전송 개선
    formats: ['image/avif', 'image/webp'],
    // 기본값엔 2048·3840(4K)이 포함돼 hero(sizes="100vw")가 거대 변형을 생성한다.
    // 이 서비스 최대 필요 폭은 desktop hero ≈ 1920, 카드 ≤ 460 → 1920 상한으로 과대 최적화 차단.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    // 최적화 이미지 캐시 31일 — Vercel 이미지 최적화 재실행(지연·부하) 감소. Steam 이미지는 거의 안 변함.
    minimumCacheTTL: 60 * 60 * 24 * 31,
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.akamai.steamstatic.com' },
      { protocol: 'https', hostname: 'shared.akamai.steamstatic.com' },
      { protocol: 'https', hostname: 'steamcdn-a.akamaihd.net' },
      { protocol: 'https', hostname: 'media.steampowered.com' },
    ],
  },
};

export default nextConfig;
