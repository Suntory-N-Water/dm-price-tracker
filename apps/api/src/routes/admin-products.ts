import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import * as v from 'valibot';
import type { ApiEnv } from '../types';
import {
  startOfficialCardDetailsCrawl,
  startOfficialCardIdsCrawl,
  startOfficialProductsCrawl,
} from '#api/external/service/crawler/crawl-runs';
import { findAdminCrawlerStatus } from '#api/external/service/crawler/admin-crawl-status';
import {
  findAvailableProducts,
  productExists,
} from '#api/external/repository/product-repository';

const productCodeSchema = v.object({
  productCode: v.pipe(
    v.string(),
    v.nonEmpty(),
    v.maxLength(30),
    v.regex(/^[a-z0-9]+$/u),
  ),
});

const availableProductSearchSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.maxLength(100))),
});

export const adminProductRoutes = new Hono<ApiEnv>()
  .get('/', async (context) => {
    return context.json(await findAdminCrawlerStatus(context.env.DISPLAY_DB));
  })
  .get(
    '/available',
    sValidator('query', availableProductSearchSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const status = await findAdminCrawlerStatus(context.env.DISPLAY_DB);
      const products = await findAvailableProducts(
        context.env.DISPLAY_DB,
        status.products.map(({ code }) => code),
        context.req.valid('query').name,
      );

      return context.json({ products });
    },
  )
  .post('/sync', async (context) =>
    context.json(await startOfficialProductsCrawl(context.env), 202),
  )
  .post(
    '/:productCode/crawl',
    sValidator('param', productCodeSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const { productCode } = context.req.valid('param');
      if (!(await productExists(context.env.DISPLAY_DB, productCode))) {
        return context.json({ error: '商品が見つかりません' }, 404);
      }

      return context.json(
        await startOfficialCardIdsCrawl(context.env, productCode),
        202,
      );
    },
  )
  .post(
    '/:productCode/card-details',
    sValidator('param', productCodeSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const { productCode } = context.req.valid('param');
      if (!(await productExists(context.env.DISPLAY_DB, productCode))) {
        return context.json({ error: '商品が見つかりません' }, 404);
      }

      return context.json(
        await startOfficialCardDetailsCrawl(context.env, productCode),
        202,
      );
    },
  );
