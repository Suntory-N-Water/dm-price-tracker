import { app } from './app';
import { runScheduledCrawl } from './scheduled';

export default {
  fetch: app.fetch,
  scheduled(_event, env, context) {
    context.waitUntil(runScheduledCrawl(env));
  },
} satisfies ExportedHandler<CloudflareEnv>;
