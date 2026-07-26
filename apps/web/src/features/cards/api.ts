import { queryOptions } from '@tanstack/react-query';
import {
  apiClient,
  parseApiResponse,
  resolveApiAssetUrl,
} from '@/shared/api/client';
import type { CardListResponse, ProductListResponse } from '@/shared/api/types';
import { cardKeys } from './queries/keys';

export type CardFilters = {
  name: string;
  productCode: string;
};

export const cardsQueryOptions = (filters: CardFilters) =>
  queryOptions({
    queryKey: cardKeys.list(filters),
    queryFn: async () => {
      const response = await apiClient.api.cards.$get({
        query: {
          name: filters.name === '' ? undefined : filters.name,
          productCode:
            filters.productCode === '' ? undefined : filters.productCode,
        },
      });
      const result = await parseApiResponse<CardListResponse>(response);
      return {
        cards: result.cards.map((card) => ({
          ...card,
          imageUrl: resolveApiAssetUrl(card.imageUrl),
        })),
      };
    },
  });

export const cardProductsQueryOptions = queryOptions({
  queryKey: ['products'],
  queryFn: async () =>
    await parseApiResponse<ProductListResponse>(
      await apiClient.api.products.$get({ query: {} }),
    ),
});
