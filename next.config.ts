import type { NextConfig } from 'next';
import { isBlackFriday2026PreviewEnvironment } from './lib/campaigns/blackFriday2026';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    if (!isBlackFriday2026PreviewEnvironment()) {
      return [];
    }

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive, nosnippet, noimageindex'
          }
        ]
      }
    ];
  }
};

export default nextConfig;
