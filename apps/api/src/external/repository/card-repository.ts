import { and, asc, eq, exists, sql, type SQL } from 'drizzle-orm';
import {
  cards,
  cardWatches,
  createDisplayDatabase,
  products,
} from '@dm-price-tracker/display-db';

export type CardSummary = {
  id: string;
  name: string;
  imageUrl: string;
  product: {
    code: string;
    name: string;
  };
  isWatching: boolean;
};

export async function findCards(
  database: D1Database,
  userEmail: string,
  filters: { name?: string; productCode?: string },
): Promise<CardSummary[]> {
  const db = createDisplayDatabase(database);
  const conditions: SQL[] = [];
  if (filters.name !== undefined && filters.name !== '') {
    const pattern = `%${filters.name.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
    conditions.push(sql`${cards.name} LIKE ${pattern} ESCAPE '\\'`);
  }
  if (filters.productCode !== undefined && filters.productCode !== '') {
    conditions.push(eq(cards.productId, filters.productCode));
  }

  const rows = await db
    .select({
      id: cards.id,
      name: cards.name,
      productCode: products.code,
      productName: products.name,
      isWatching: exists(
        db
          .select({ one: sql`1` })
          .from(cardWatches)
          .where(
            and(
              eq(cardWatches.userEmail, userEmail),
              eq(cardWatches.cardId, cards.id),
              eq(cardWatches.isCurrent, 1),
            ),
          ),
      ),
    })
    .from(cards)
    .innerJoin(products, eq(products.code, cards.productId))
    .where(and(...conditions))
    .orderBy(asc(cards.id));

  return rows.map((card) => ({
    id: card.id,
    name: card.name,
    imageUrl: `/api/cards/${encodeURIComponent(card.id)}/image`,
    product: {
      code: card.productCode,
      name: card.productName,
    },
    isWatching: Boolean(card.isWatching),
  }));
}

export async function findCardImageKey(
  database: D1Database,
  cardId: string,
): Promise<string | undefined> {
  const [card] = await createDisplayDatabase(database)
    .select({ imageKey: cards.imageKey })
    .from(cards)
    .where(eq(cards.id, cardId))
    .limit(1);

  return card?.imageKey;
}
