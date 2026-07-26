import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

export type DisplayDatabase = DrizzleD1Database<typeof schema>;

// D1は1クエリあたり100個までしかパラメータを束縛できないため、可変長の値はこの数を超えないよう分割する
export const bindParameterLimit = 100;

export function createDisplayDatabase(binding: D1Database): DisplayDatabase {
  return drizzle(binding, { schema });
}

export * from './schema';
