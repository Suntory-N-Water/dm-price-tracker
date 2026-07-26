'use server';

import * as v from 'valibot';
import { crawlProductResponseSchema } from '@/external/dto/api-schemas';
import { requestApi } from '@/external/handler/api-request.server';

export async function syncAdminProductsAction() {
  return v.parse(
    crawlProductResponseSchema,
    await requestApi('/api/admin/products/sync', {
      method: 'POST',
    }),
  );
}

export async function crawlAdminProductAction(productCode: string) {
  return v.parse(
    crawlProductResponseSchema,
    await requestApi(
      `/api/admin/products/${encodeURIComponent(productCode)}/crawl`,
      { method: 'POST' },
    ),
  );
}

export async function crawlAdminProductCardDetailsAction(productCode: string) {
  return v.parse(
    crawlProductResponseSchema,
    await requestApi(
      `/api/admin/products/${encodeURIComponent(productCode)}/card-details`,
      { method: 'POST' },
    ),
  );
}
