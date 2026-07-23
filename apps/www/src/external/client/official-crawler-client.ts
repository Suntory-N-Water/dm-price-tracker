export async function syncOfficialProducts(
  client: CloudflareEnv['OFFICIAL_CRAWLER'],
): Promise<{ syncedCount: number }> {
  return await client.syncProducts();
}

export async function startOfficialProductCrawl(
  client: CloudflareEnv['OFFICIAL_CRAWLER'],
  productCode: string,
): Promise<{ id: string; status: unknown }> {
  return await client.crawl(productCode);
}

export async function findOfficialProductCrawls(
  client: CloudflareEnv['OFFICIAL_CRAWLER'],
) {
  return await client.listProductCrawls();
}
