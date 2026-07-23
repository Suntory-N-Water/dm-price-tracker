import * as v from 'valibot';
import {
  cardWatchListResponseSchema,
  priceHistoryResponseSchema,
  productListResponseSchema,
} from '@/external/dto/api-schemas';
import { requestApi } from '@/external/handler/api-request.server';

export async function getCardWatchesServer(
  filters = {
    name: '',
    productCode: '',
  },
) {
  const params = new URLSearchParams();
  if (filters.name !== '') {
    params.set('name', filters.name);
  }
  if (filters.productCode !== '') {
    params.set('productCode', filters.productCode);
  }
  const query = params.size === 0 ? '' : `?${params.toString()}`;
  return v.parse(
    cardWatchListResponseSchema,
    await requestApi(`/api/card-watches${query}`),
  );
}

export async function getPriceHistoryServer(cardId: string) {
  return v.parse(
    priceHistoryResponseSchema,
    await requestApi(
      `/api/card-watches/${encodeURIComponent(cardId)}/price-history`,
    ),
  );
}

export async function getProductsServer() {
  return v.parse(productListResponseSchema, await requestApi('/api/products'));
}
