import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

export type CrawlerDatabase = DrizzleD1Database<typeof schema>;

export function createCrawlerDatabase(db: D1Database): CrawlerDatabase {
  return drizzle(db, { schema });
}
