import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: '5mb' }, // image uploads (≤ 4 MB JPEG)
  },
};

export default nextConfig;
