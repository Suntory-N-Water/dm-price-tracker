import * as v from 'valibot';
import {
  cardListResponseSchema,
  productListResponseSchema,
} from '@/external/dto/api-schemas';
import { requestApi } from '@/external/handler/api-request.server';

export async function getCardsServer(
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
    cardListResponseSchema,
    await requestApi(`/api/cards${query}`),
  );
}

export async function getCardProductsServer() {
  return v.parse(productListResponseSchema, await requestApi('/api/products'));
}
