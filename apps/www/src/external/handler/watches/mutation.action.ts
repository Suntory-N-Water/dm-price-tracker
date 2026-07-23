'use server';

import * as v from 'valibot';
import {
  bulkExcludeFormSchema,
  bulkExcludeResponseSchema,
  cardWatchFormSchema,
  cardWatchSettingsResponseSchema,
} from '@/external/dto/api-schemas';
import { requestApi } from '@/external/handler/api-request.server';

export async function startCardWatchAction(cardId: string) {
  v.parse(
    cardWatchSettingsResponseSchema,
    await requestApi('/api/card-watches', {
      method: 'POST',
      body: JSON.stringify({ cardId }),
    }),
  );
}

export async function stopCardWatchAction(cardId: string) {
  await requestApi(`/api/card-watches/${encodeURIComponent(cardId)}`, {
    method: 'DELETE',
  });
}

export async function updateCardWatchAction(
  cardId: string,
  input: {
    additionalKeywords: string[];
    cardExcludeKeywords: string[];
  },
) {
  const parsed = v.parse(cardWatchFormSchema, input);
  v.parse(
    cardWatchSettingsResponseSchema,
    await requestApi(`/api/card-watches/${encodeURIComponent(cardId)}`, {
      method: 'PUT',
      body: JSON.stringify({
        additionalKeywords: parsed.additionalKeywords.filter(Boolean),
        cardExcludeKeywords: parsed.cardExcludeKeywords.filter(Boolean),
      }),
    }),
  );
}

export async function addBulkExcludeKeywordAction(input: {
  cardIds: string[];
  excludeKeyword: string;
}) {
  const parsed = v.parse(bulkExcludeFormSchema, input);
  return v.parse(
    bulkExcludeResponseSchema,
    await requestApi('/api/card-watches/bulk-exclude-keyword', {
      method: 'POST',
      body: JSON.stringify(parsed),
    }),
  );
}
