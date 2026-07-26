import type { InferResponseType } from 'hono/client';
import type { apiClient } from './client';

export type CardListResponse = InferResponseType<
  typeof apiClient.api.cards.$get,
  200
>;
export type Card = CardListResponse['cards'][number];

export type ProductListResponse = InferResponseType<
  typeof apiClient.api.products.$get,
  200
>;
export type Product = ProductListResponse['products'][number];

export type CardWatchListResponse = InferResponseType<
  (typeof apiClient.api)['card-watches']['$get'],
  200
>;
export type CardWatch = CardWatchListResponse['watches'][number];

export type PriceHistory = InferResponseType<
  (typeof apiClient.api)['card-watches'][':cardId']['price-history']['$get'],
  200
>;

export type SettingsResponse = InferResponseType<
  (typeof apiClient.api.settings)['common-exclude-keywords']['$get'],
  200
>;

export type UpdateSettingsResponse = InferResponseType<
  (typeof apiClient.api.settings)['common-exclude-keywords']['$put'],
  200
>;

export type BulkExcludeResponse = InferResponseType<
  (typeof apiClient.api)['card-watches']['bulk-exclude-keyword']['$post'],
  200
>;

export type AdminProductListResponse = InferResponseType<
  (typeof apiClient.api.admin.products)['$get'],
  200
>;
export type AdminProduct = AdminProductListResponse['products'][number];
export type CrawlSummary = AdminProductListResponse['mercariCrawl'];
