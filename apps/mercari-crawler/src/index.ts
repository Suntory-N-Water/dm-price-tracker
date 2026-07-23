export { MercariCrawlerJob } from './crawler/MercariCrawlerJob';
export { MercariCrawlerOrchestrator } from './crawler/MercariCrawlerOrchestrator';

export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);

    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },

  async scheduled(_controller, env) {
    await env.ORCHESTRATOR.create({ params: {} });
  },
} satisfies ExportedHandler<Env>;
