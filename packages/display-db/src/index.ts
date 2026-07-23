import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

export type DisplayDatabase = DrizzleD1Database<typeof schema>;

export function createDisplayDatabase(binding: D1Database): DisplayDatabase {
  return drizzle(binding, { schema });
}

export * from './schema';
