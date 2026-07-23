import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import * as v from 'valibot';
import type { ApiEnv } from '../types';
import {
  findCardImageKey,
  findCards,
} from '@/external/repository/card-repository';
import { createR2Response } from '@/external/service/image/create-r2-response';

const cardSearchSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.maxLength(100))),
  productCode: v.optional(
    v.pipe(v.string(), v.maxLength(30), v.regex(/^[a-z0-9]+$/u)),
  ),
});

const cardIdParamSchema = v.object({
  cardId: v.pipe(
    v.string(),
    v.nonEmpty(),
    v.maxLength(100),
    v.regex(/^[A-Za-z0-9-]+$/u),
  ),
});

export const cardRoutes = new Hono<ApiEnv>()
  .get(
    '/',
    sValidator('query', cardSearchSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const cards = await findCards(
        context.env.DISPLAY_DB,
        context.var.userEmail,
        context.req.valid('query'),
      );

      return context.json({ cards });
    },
  )
  .get(
    '/:cardId/image',
    sValidator('param', cardIdParamSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const imageKey = await findCardImageKey(
        context.env.DISPLAY_DB,
        context.req.valid('param').cardId,
      );
      if (imageKey === undefined) {
        return context.json({ error: 'カードが見つかりません' }, 404);
      }
      const image = await context.env.CARD_IMAGES.get(imageKey);
      if (image === null) {
        return context.json({ error: 'カード画像が見つかりません' }, 404);
      }

      return createR2Response(image);
    },
  );
