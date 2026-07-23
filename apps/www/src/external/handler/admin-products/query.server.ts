import * as v from 'valibot';
import {
  adminProductListResponseSchema,
  productListResponseSchema,
} from '@/external/dto/api-schemas';
import { requestApi } from '@/external/handler/api-request.server';

export async function getAdminProductsServer() {
  return v.parse(
    adminProductListResponseSchema,
    await requestApi('/api/admin/products'),
  );
}

export async function getAvailableAdminProductsServer(name = '') {
  const query = name === '' ? '' : `?name=${encodeURIComponent(name)}`;
  return v.parse(
    productListResponseSchema,
    await requestApi(`/api/admin/products/available${query}`),
  );
}
