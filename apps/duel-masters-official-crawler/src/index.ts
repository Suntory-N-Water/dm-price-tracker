import { WorkerEntrypoint } from 'cloudflare:workers';
import * as v from 'valibot';
import { crawlParamsSchema } from './lib/crawlParams';

export {
  DuelMastersOfficialCrawlerJob,
  DuelMastersOfficialCrawlerOrchestrator,
} from './crawler';

export default class DuelMastersOfficialCrawlerService extends WorkerEntrypoint<Env> {
  override async fetch(request: Request): Promise<Response> {
    const requestUrl = new URL(request.url);

    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  async crawl(productCode: string) {
    const params = v.parse(crawlParamsSchema, { productCode });
    const instance = await this.env.ORCHESTRATOR.create({ params });

    return {
      id: instance.id,
      status: await instance.status(),
    };
  }
}
