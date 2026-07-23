import { sql, type InferInsertModel, type InferSelectModel } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

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

// 追加ワードの変更は価格履歴の系列を分け、同じ追加ワードへ戻すと元の系列を再利用する必要があるため、
// Card×正規化済み追加ワードを自然キーにして系列を一意に定める。
export const priceSeries = sqliteTable(
  'price_series',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    normalizedAdditionalKeyword: text('normalized_additional_keyword')
      .notNull()
      .default(''),
    createdAt: text('created_at').notNull().default(currentTimestamp),
  },
  (table) => [
    uniqueIndex('price_series_card_additional_keyword_unique_idx').on(
      table.cardId,
      table.normalizedAdditionalKeyword,
    ),
  ],
);

// 除外ワードの変更は価格履歴を分けない一方、クロールはCard×追加ワード×除外ワードの完全一致単位で
// 共有するため、PriceSeriesとは別テーブルにして両方の粒度を両立させる。
export const searchConditions = sqliteTable(
  'search_conditions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    priceSeriesId: integer('price_series_id')
      .notNull()
      .references(() => priceSeries.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    normalizedExcludeKeyword: text('normalized_exclude_keyword')
      .notNull()
      .default(''),
    createdAt: text('created_at').notNull().default(currentTimestamp),
  },
  (table) => [
    uniqueIndex('search_conditions_price_series_exclude_keyword_unique_idx').on(
      table.priceSeriesId,
      table.normalizedExcludeKeyword,
    ),
  ],
);

export const pricePoints = sqliteTable(
  'price_points',
  {
    searchConditionId: integer('search_condition_id')
      .notNull()
      .references(() => searchConditions.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    crawledAt: text('crawled_at').notNull().default(currentTimestamp),
    price: integer('price').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.searchConditionId, table.crawledAt] }),
    check('price_points_price_check', sql`${table.price} >= 0`),
  ],
);

export const screenshots = sqliteTable(
  'screenshots',
  {
    searchConditionId: integer('search_condition_id')
      .notNull()
      .references(() => searchConditions.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    crawledAt: text('crawled_at').notNull().default(currentTimestamp),
    imageKey: text('image_key').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.searchConditionId, table.crawledAt] }),
  ],
);

export const users = sqliteTable('users', {
  email: text('email').primaryKey(),
  createdAt: text('created_at').notNull().default(currentTimestamp),
});

// 設定変更のたびに行を追加しUPDATEで上書きしないのは、除外ワードを以前の値へ戻したときに、
// 当時参照していたsearch_condition_idを辿って価格履歴を再利用できるようにするため。
export const cardWatches = sqliteTable(
  'card_watches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userEmail: text('user_email')
      .notNull()
      .references(() => users.email, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    cardId: text('card_id')
      .notNull()
      .references(() => cards.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    searchConditionId: integer('search_condition_id')
      .notNull()
      .references(() => searchConditions.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    isCurrent: integer('is_current').notNull().default(1),
    createdAt: text('created_at').notNull().default(currentTimestamp),
  },
  (table) => [
    uniqueIndex('card_watches_current_unique_idx')
      .on(table.userEmail, table.cardId)
      .where(sql`${table.isCurrent} = 1`),
    index('card_watches_user_card_idx').on(table.userEmail, table.cardId),
    index('card_watches_search_condition_idx').on(
      table.searchConditionId,
      table.isCurrent,
    ),
    check('card_watches_is_current_check', sql`${table.isCurrent} in (0, 1)`),
  ],
);

export type Product = InferSelectModel<typeof products>;
export type NewProduct = InferInsertModel<typeof products>;
export type Card = InferSelectModel<typeof cards>;
export type NewCard = InferInsertModel<typeof cards>;
export type PriceSeries = InferSelectModel<typeof priceSeries>;
export type NewPriceSeries = InferInsertModel<typeof priceSeries>;
export type SearchCondition = InferSelectModel<typeof searchConditions>;
export type NewSearchCondition = InferInsertModel<typeof searchConditions>;
export type PricePoint = InferSelectModel<typeof pricePoints>;
export type NewPricePoint = InferInsertModel<typeof pricePoints>;
export type Screenshot = InferSelectModel<typeof screenshots>;
export type NewScreenshot = InferInsertModel<typeof screenshots>;
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type CardWatch = InferSelectModel<typeof cardWatches>;
export type NewCardWatch = InferInsertModel<typeof cardWatches>;
