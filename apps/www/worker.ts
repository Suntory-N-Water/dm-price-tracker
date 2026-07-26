// biome-ignore lint/suspicious/noTsIgnore: `.open-next/worker.js` はビルド時に生成される
// @ts-ignore `.open-next/worker.js` はビルド時に生成される
import { default as handler } from './.open-next/worker.js';
import { runScheduledCrawl } from './src/api/scheduled';

export default {
  fetch: handler.fetch,
  async scheduled(_event, env, context) {
    context.waitUntil(runScheduledCrawl(env));
  },
} satisfies ExportedHandler<CloudflareEnv>;

// biome-ignore lint/suspicious/noTsIgnore: `.open-next/worker.js` はビルド時に生成される
// @ts-expect-error `.open-next/worker.js` はビルド時に生成される
// biome-ignore format: `@ts-expect-error` を生成前のモジュール指定へ適用する
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';
