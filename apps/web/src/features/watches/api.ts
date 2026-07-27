import { queryOptions } from '@tanstack/react-query';
import * as v from 'valibot';
import {
  apiClient,
  parseApiResponse,
  resolveApiAssetUrl,
} from '@/shared/api/client';
import type {
  BulkExcludeResponse,
  CardWatchListResponse,
  PriceHistory,
} from '@/shared/api/types';
import { bulkExcludeFormSchema, cardWatchFormSchema } from './form-schemas';
import { watchKeys } from './queries/keys';

export type WatchFilters = {
  name: string;
  productCode: string;
};

export const watchesQueryOptions = (filters: WatchFilters) =>
  queryOptions({
    queryKey: watchKeys.list(filters),
    queryFn: async () => {
      const response = await apiClient.api['card-watches'].$get({
        query: {
          name: filters.name === '' ? undefined : filters.name,
          productCode:
            filters.productCode === '' ? undefined : filters.productCode,
        },
      });
      const result = await parseApiResponse<CardWatchListResponse>(response);
      return {
        watches: result.watches.map((watch) => ({
          ...watch,
          card: {
            ...watch.card,
            imageUrl: resolveApiAssetUrl(watch.card.imageUrl),
          },
        })),
      };
    },
  });

export type PriceHistoryPeriod = '24h' | '7d' | '30d';

export const priceHistoryQueryOptions = (
  cardId: string,
  period: PriceHistoryPeriod,
) =>
  queryOptions({
    queryKey: watchKeys.detail(cardId, period),
    queryFn: async () => {
      const response = await apiClient.api['card-watches'][':cardId'][
        'price-history'
      ].$get({ param: { cardId }, query: { period } });
      const result = await parseApiResponse<PriceHistory>(response);
      return {
        ...result,
        card: {
          ...result.card,
          imageUrl: resolveApiAssetUrl(result.card.imageUrl),
        },
        pricePoints: result.pricePoints.map((point) => ({
          ...point,
          screenshotUrl:
            point.screenshotUrl === null
              ? null
              : resolveApiAssetUrl(point.screenshotUrl),
        })),
      };
    },
  });

export async function startCardWatch(cardId: string): Promise<void> {
  await parseApiResponse(
    await apiClient.api['card-watches'].$post({ json: { cardId } }),
  );
}

export async function stopCardWatch(cardId: string): Promise<void> {
  const response = await apiClient.api['card-watches'][':cardId'].$delete({
    param: { cardId },
  });
  if (!response.ok) {
    await parseApiResponse(response);
  }
}

export async function updateCardWatch(
  cardId: string,
  input: {
    additionalKeywords: string[];
    cardExcludeKeywords: string[];
  },
): Promise<void> {
  const parsed = v.parse(cardWatchFormSchema, input);
  await parseApiResponse(
    await apiClient.api['card-watches'][':cardId'].$put({
      param: { cardId },
      json: {
        additionalKeywords: parsed.additionalKeywords.filter(Boolean),
        cardExcludeKeywords: parsed.cardExcludeKeywords.filter(Boolean),
      },
    }),
  );
}

export async function addBulkExcludeKeyword(input: {
  cardIds: string[];
  excludeKeyword: string;
}): Promise<BulkExcludeResponse> {
  return await parseApiResponse<BulkExcludeResponse>(
    await apiClient.api['card-watches']['bulk-exclude-keyword'].$post({
      json: v.parse(bulkExcludeFormSchema, input),
    }),
  );
}
