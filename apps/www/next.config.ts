import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

void initOpenNextCloudflareForDev({
  persist: { path: '../../.wrangler/state/v3' },
});

const nextConfig: NextConfig = {};

export default nextConfig;
