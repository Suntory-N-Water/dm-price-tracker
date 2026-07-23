import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';
import * as v from 'valibot';
import type { ApiEnv } from '../types';
import {
  changeCardWatch,
  findPriceHistory,
  findCurrentCardWatches,
  findScreenshotImageKey,
  startCardWatch,
  stopCardWatch,
} from '@/external/repository/card-watch-repository';
import { findCommonExcludeKeywords } from '@/external/repository/user-repository';
import { keywordSlotsSchema } from '@/external/dto/keyword-slots';
import { normalizeKeywords } from '@/external/service/search-condition/normalize-keywords';
import { addBulkCardExcludeKeyword } from '@/external/service/settings/add-bulk-card-exclude-keyword';
import { createR2Response } from '@/external/service/image/create-r2-response';

const startCardWatchSchema = v.strictObject({
  cardId: v.pipe(
    v.string(),
    v.nonEmpty(),
    v.maxLength(100),
    v.regex(/^[A-Za-z0-9-]+$/u),
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

const changeCardWatchSchema = v.strictObject({
  additionalKeywords: keywordSlotsSchema,
  cardExcludeKeywords: keywordSlotsSchema,
});

const bulkExcludeKeywordSchema = v.strictObject({
  cardIds: v.pipe(
    v.array(
      v.pipe(
        v.string(),
        v.nonEmpty(),
        v.maxLength(100),
        v.regex(/^[A-Za-z0-9-]+$/u),
      ),
    ),
    v.minLength(1),
    v.maxLength(100),
    v.transform((cardIds) => [...new Set(cardIds)]),
  ),
  excludeKeyword: v.pipe(
    v.string(),
    v.nonEmpty(),
    v.maxLength(50),
    v.regex(/^[^\s\u3000]+$/u),
    v.transform((keyword) => normalizeKeywords([keyword])[0] ?? ''),
  ),
});

const cardWatchSearchSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.maxLength(100))),
  productCode: v.optional(
    v.pipe(v.string(), v.maxLength(30), v.regex(/^[a-z0-9]+$/u)),
  ),
});

const screenshotParamSchema = v.object({
  cardId: cardIdParamSchema.entries.cardId,
  crawledAt: v.pipe(
    v.string(),
    v.regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u),
  ),
});

export const cardWatchRoutes = new Hono<ApiEnv>()
  .get(
    '/',
    sValidator('query', cardWatchSearchSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const commonExcludeKeywords = await findCommonExcludeKeywords(
        context.env.DISPLAY_DB,
        context.var.userEmail,
      );
      const watches = await findCurrentCardWatches({
        database: context.env.DISPLAY_DB,
        userEmail: context.var.userEmail,
        commonExcludeKeywords,
        filters: context.req.valid('query'),
      });

      return context.json({ watches });
    },
  )
  .post(
    '/',
    sValidator('json', startCardWatchSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const { cardId } = context.req.valid('json');
      const commonExcludeKeywords = await findCommonExcludeKeywords(
        context.env.DISPLAY_DB,
        context.var.userEmail,
      );
      const watch = await startCardWatch({
        database: context.env.DISPLAY_DB,
        userEmail: context.var.userEmail,
        cardId,
        commonExcludeKeywords,
      });
      if (watch === undefined) {
        return context.json({ error: 'カードが見つかりません' }, 404);
      }

      return context.json(watch, 201);
    },
  )
  .post(
    '/bulk-exclude-keyword',
    sValidator('json', bulkExcludeKeywordSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const { cardIds, excludeKeyword } = context.req.valid('json');
      const result = await addBulkCardExcludeKeyword({
        database: context.env.DISPLAY_DB,
        userEmail: context.var.userEmail,
        cardIds,
        excludeKeyword,
      });

      return context.json(result);
    },
  )
  .get(
    '/:cardId/price-history',
    sValidator('param', cardIdParamSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const history = await findPriceHistory(
        context.env.DISPLAY_DB,
        context.var.userEmail,
        context.req.valid('param').cardId,
      );
      if (history === undefined) {
        return context.json(
          { error: '価格チェック中のカードが見つかりません' },
          404,
        );
      }

      return context.json(history);
    },
  )
  .get(
    '/:cardId/screenshots/:crawledAt',
    sValidator('param', screenshotParamSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const { cardId, crawledAt } = context.req.valid('param');
      const imageKey = await findScreenshotImageKey({
        database: context.env.DISPLAY_DB,
        userEmail: context.var.userEmail,
        cardId,
        crawledAt,
      });
      if (imageKey === undefined) {
        return context.json({ error: '価格点の画像が見つかりません' }, 404);
      }
      const image = await context.env.SCREENSHOTS.get(imageKey);
      if (image === null) {
        return context.json({ error: '画像の保存期間が終了しています' }, 404);
      }

      return createR2Response(image);
    },
  )
  .put(
    '/:cardId',
    sValidator('param', cardIdParamSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    sValidator('json', changeCardWatchSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const { cardId } = context.req.valid('param');
      const { additionalKeywords, cardExcludeKeywords } =
        context.req.valid('json');
      const commonExcludeKeywords = await findCommonExcludeKeywords(
        context.env.DISPLAY_DB,
        context.var.userEmail,
      );
      if (
        new Set([...commonExcludeKeywords, ...cardExcludeKeywords]).size > 3
      ) {
        return context.json(
          { error: '共通とカード別の除外ワードは合計3枠以内です' },
          400,
        );
      }

      const watch = await changeCardWatch({
        database: context.env.DISPLAY_DB,
        userEmail: context.var.userEmail,
        cardId,
        additionalKeywords,
        commonExcludeKeywords,
        cardExcludeKeywords,
      });
      if (watch === undefined) {
        return context.json(
          { error: '価格チェック中のカードが見つかりません' },
          404,
        );
      }

      return context.json(watch);
    },
  )
  .delete(
    '/:cardId',
    sValidator('param', cardIdParamSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const stopped = await stopCardWatch(
        context.env.DISPLAY_DB,
        context.var.userEmail,
        context.req.valid('param').cardId,
      );
      if (!stopped) {
        return context.json(
          { error: '価格チェック中のカードが見つかりません' },
          404,
        );
      }

      return context.body(null, 204);
    },
  );
