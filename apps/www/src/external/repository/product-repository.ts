import { and, asc, eq, inArray, notInArray, sql, type SQL } from 'drizzle-orm';
import { createDisplayDatabase, products } from '@dm-price-tracker/display-db';

export type Product = {
  code: string;
  name: string;
};

export async function findProductsByCodes(
  database: D1Database,
  productCodes: readonly string[],
): Promise<Product[]> {
  if (productCodes.length === 0) {
    return [];
  }

  return await createDisplayDatabase(database)
    .select({ code: products.code, name: products.name })
    .from(products)
    .where(inArray(products.code, [...productCodes]));
}

export async function findAvailableProducts(
  database: D1Database,
  startedProductCodes: readonly string[],
  name: string | undefined,
): Promise<Product[]> {
  const conditions: SQL[] = [];
  if (startedProductCodes.length > 0) {
    conditions.push(notInArray(products.code, [...startedProductCodes]));
  }
  if (name !== undefined && name !== '') {
    const pattern = `%${name.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    conditions.push(sql`${products.name} LIKE ${pattern} ESCAPE '\\'`);
  }

  return await createDisplayDatabase(database)
    .select({ code: products.code, name: products.name })
    .from(products)
    .where(and(...conditions))
    .orderBy(asc(products.code));
}

export async function productExists(
  database: D1Database,
  productCode: string,
): Promise<boolean> {
  const [product] = await createDisplayDatabase(database)
    .select({ code: products.code })
    .from(products)
    .where(eq(products.code, productCode))
    .limit(1);

  return product !== undefined;
}
