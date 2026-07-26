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
// @ts-ignore `.open-next/worker.js` はビルド時に生成される
export {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache,
} from './.open-next/worker.js';
