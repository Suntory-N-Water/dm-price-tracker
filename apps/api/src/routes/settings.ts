import { Hono } from 'hono';
import { sValidator } from '@hono/standard-validator';
import * as v from 'valibot';
import type { ApiEnv } from '../types';
import { findCommonExcludeKeywords } from '#api/external/repository/user-repository';
import { keywordSlotsSchema } from '#api/external/dto/keyword-slots';
import { updateCommonExcludeKeywords } from '#api/external/service/settings/update-common-exclude-keywords';

const commonExcludeKeywordsSchema = v.strictObject({
  keywords: keywordSlotsSchema,
});

export const settingsRoutes = new Hono<ApiEnv>()
  .get('/common-exclude-keywords', async (context) => {
    const keywords = await findCommonExcludeKeywords(
      context.env.DISPLAY_DB,
      context.var.userEmail,
    );

    return context.json({ keywords });
  })
  .put(
    '/common-exclude-keywords',
    sValidator('json', commonExcludeKeywordsSchema, (result, context) => {
      if (!result.success) {
        return context.json({ error: '入力値が不正です' }, 400);
      }
    }),
    async (context) => {
      const { keywords } = context.req.valid('json');
      const updatedCardCount = await updateCommonExcludeKeywords(
        context.env.DISPLAY_DB,
        context.var.userEmail,
        keywords,
      );

      return context.json({ keywords, updatedCardCount });
    },
  );
