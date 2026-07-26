// biome-ignore-all lint/suspicious/noTsIgnore: OpenNext の生成前だけ存在しないモジュールを参照する
// @ts-ignore `.open-next/worker.js` はビルド時に生成される
import { default as handler } from './.open-next/worker.js';
import { runScheduledCrawl } from './src/api/scheduled';

export default {
  fetch: handler.fetch,
  async scheduled(_event, env, context) {
    context.waitUntil(runScheduledCrawl(env));
  },
} satisfies ExportedHandler<CloudflareEnv>;

// biome-ignore format: `@ts-ignore` を生成前のモジュール指定へ適用する
// @ts-ignore `.open-next/worker.js` はビルド時に生成される
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';
