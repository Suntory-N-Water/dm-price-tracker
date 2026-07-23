import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import * as v from 'valibot';
import type { ApiEnv } from '../types';
import {
  findOfficialProductCrawls,
  startOfficialProductCrawl,
  syncOfficialProducts,
} from '@/external/client/official-crawler-client';
import {
  findAvailableProducts,
  findProductsByCodes,
  productExists,
} from '@/external/repository/product-repository';

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
    const crawls = await findOfficialProductCrawls(
      context.env.OFFICIAL_CRAWLER,
    );
    const products = await findProductsByCodes(
      context.env.DISPLAY_DB,
      crawls.map(({ productCode }) => productCode),
    );
    const productByCode = new Map(
      products.map((product) => [product.code, product]),
    );

    return context.json({
      products: crawls.flatMap((crawl) => {
        const product = productByCode.get(crawl.productCode);
        return product === undefined
          ? []
          : [
              {
                ...product,
                status: crawl.status,
                updatedAt: crawl.updatedAt,
                error: crawl.error,
              },
            ];
      }),
    });
  })
  .get(
    '/available',
    sValidator('query', availableProductSearchSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const crawls = await findOfficialProductCrawls(
        context.env.OFFICIAL_CRAWLER,
      );
      const products = await findAvailableProducts(
        context.env.DISPLAY_DB,
        crawls.map(({ productCode }) => productCode),
        context.req.valid('query').name,
      );

      return context.json({ products });
    },
  )
  .post('/sync', async (context) =>
    context.json(await syncOfficialProducts(context.env.OFFICIAL_CRAWLER)),
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
        await startOfficialProductCrawl(
          context.env.OFFICIAL_CRAWLER,
          productCode,
        ),
        202,
      );
    },
  );
