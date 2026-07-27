import { and, asc, eq, ne } from 'drizzle-orm';
import {
  createDisplayDatabase,
  userCommonExcludeKeywords,
  users,
} from '@dm-price-tracker/display-db';

export async function registerUser(
  database: D1Database,
  email: string,
): Promise<void> {
  const db = createDisplayDatabase(database);
  await db.batch([
    db.insert(users).values({ email }).onConflictDoNothing(),
    db
      .insert(userCommonExcludeKeywords)
      .values([
        { userEmail: email, position: 0, keyword: 'まとめ' },
        { userEmail: email, position: 1, keyword: '専用' },
        { userEmail: email, position: 2, keyword: '' },
      ])
      .onConflictDoNothing(),
  ]);
}

export async function findCommonExcludeKeywords(
  database: D1Database,
  email: string,
): Promise<string[]> {
  const keywords = await createDisplayDatabase(database)
    .select({ keyword: userCommonExcludeKeywords.keyword })
    .from(userCommonExcludeKeywords)
    .where(
      and(
        eq(userCommonExcludeKeywords.userEmail, email),
        ne(userCommonExcludeKeywords.keyword, ''),
      ),
    )
    .orderBy(asc(userCommonExcludeKeywords.position));

  return keywords.map(({ keyword }) => keyword);
}
