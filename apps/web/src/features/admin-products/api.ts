import { queryOptions } from '@tanstack/react-query';
import { apiClient, parseApiResponse } from '@/shared/api/client';
import type {
  AdminProductListResponse,
  ProductListResponse,
} from '@/shared/api/types';
import { adminProductKeys } from './queries/keys';

export const adminProductsQueryOptions = queryOptions({
  queryKey: adminProductKeys.list,
  queryFn: async () =>
    await parseApiResponse<AdminProductListResponse>(
      await apiClient.api.admin.products.$get(),
    ),
});

export const availableAdminProductsQueryOptions = (name: string) =>
  queryOptions({
    queryKey: adminProductKeys.available(name),
    queryFn: async () =>
      await parseApiResponse<ProductListResponse>(
        await apiClient.api.admin.products.available.$get({
          query: { name: name === '' ? undefined : name },
        }),
      ),
  });

export async function syncAdminProducts(): Promise<void> {
  await parseApiResponse(await apiClient.api.admin.products.sync.$post());
}

export async function crawlAdminProduct(productCode: string): Promise<void> {
  await parseApiResponse(
    await apiClient.api.admin.products[':productCode'].crawl.$post({
      param: { productCode },
    }),
  );
}

export async function crawlAdminProductCardDetails(
  productCode: string,
): Promise<void> {
  await parseApiResponse(
    await apiClient.api.admin.products[':productCode']['card-details'].$post({
      param: { productCode },
    }),
  );
}
