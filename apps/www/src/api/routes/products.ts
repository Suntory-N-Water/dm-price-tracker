import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import * as v from 'valibot';
import type { ApiEnv } from '../types';
import { findAvailableProducts } from '@/external/repository/product-repository';

const productSearchSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.maxLength(100))),
});

export const productRoutes = new Hono<ApiEnv>().get(
  '/',
  sValidator('query', productSearchSchema, (result, context) => {
    if (!result.success) {
      return context.json({ error: '入力値が不正です' }, 400);
    }
  }),
  async (context) => {
    const products = await findAvailableProducts(
      context.env.DISPLAY_DB,
      [],
      context.req.valid('query').name,
    );

    return context.json({ products });
  },
);
