import { sql } from 'drizzle-orm';
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const currentTimestamp = sql`(CURRENT_TIMESTAMP)`;

export const products = sqliteTable('products', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull().default(currentTimestamp),
});

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.code, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    name: text('name').notNull(),
    imageKey: text('image_key').notNull(),
    createdAt: text('created_at').notNull().default(currentTimestamp),
  },
  (table) => [index('cards_product_id_idx').on(table.productId)],
);
