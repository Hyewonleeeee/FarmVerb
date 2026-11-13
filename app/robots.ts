import type { MetadataRoute } from 'next';
import { isBlackFriday2026PreviewEnvironment } from '@/lib/campaigns/blackFriday2026';

export default function robots(): MetadataRoute.Robots {
  if (isBlackFriday2026PreviewEnvironment()) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/'
      }
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/'
    }
  };
}
