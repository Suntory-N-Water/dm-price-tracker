import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

await initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {};

export default nextConfig;
