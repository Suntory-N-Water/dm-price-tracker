import { sql, type InferInsertModel, type InferSelectModel } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const executeStatuses = [
  'WAITING',
  'RUNNING',
  'FINISHED',
  'ABORTED',
] as const;

export type ExecuteStatus = (typeof executeStatuses)[number];
export type JobStatus = ExecuteStatus;

const currentTimestamp = sql`(CURRENT_TIMESTAMP)`;

export const executes = sqliteTable(
  'executes',
  {
    id: text('id').primaryKey(),
    status: text('status').$type<ExecuteStatus>().notNull().default('WAITING'),
    startedAt: text('started_at'),
    createdAt: text('created_at').notNull().default(currentTimestamp),
    updatedAt: text('updated_at').notNull().default(currentTimestamp),
  },
  (table) => [
    index('executes_status_idx').on(table.status),
    check(
      'executes_status_check',
      sql`${table.status} in ('WAITING', 'RUNNING', 'FINISHED', 'ABORTED')`,
    ),
  ],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    executeId: text('execute_id')
      .notNull()
      .references(() => executes.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    parentJobId: text('parent_job_id'),
    kind: text('kind').notNull(),
    status: text('status').$type<JobStatus>().notNull().default('WAITING'),
    url: text('url').notNull(),
    meta: text('meta').notNull().default('{}'),
    resultCount: integer('result_count').notNull().default(0),
    resultError: text('result_error'),
    startedAt: text('started_at'),
    crawledAt: text('crawled_at'),
    createdAt: text('created_at').notNull().default(currentTimestamp),
    updatedAt: text('updated_at').notNull().default(currentTimestamp),
  },
  (table) => [
    uniqueIndex('jobs_execute_url_unique_idx').on(table.executeId, table.url),
    index('jobs_execute_status_idx').on(table.executeId, table.status),
    index('jobs_parent_job_id_idx').on(table.parentJobId),
    check(
      'jobs_status_check',
      sql`${table.status} in ('WAITING', 'RUNNING', 'FINISHED', 'ABORTED')`,
    ),
    check('jobs_result_count_check', sql`${table.resultCount} >= 0`),
    foreignKey({
      name: 'jobs_parent_job_id_fk',
      columns: [table.parentJobId],
      foreignColumns: [table.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
  ],
);

export const records = sqliteTable(
  'records',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    url: text('url').notNull(),
    meta: text('meta').notNull().default('{}'),
    data: text('data').notNull(),
    startedAt: text('started_at').notNull().default(currentTimestamp),
    crawledAt: text('crawled_at').notNull().default(currentTimestamp),
    createdAt: text('created_at').notNull().default(currentTimestamp),
    updatedAt: text('updated_at').notNull().default(currentTimestamp),
  },
  (table) => [
    index('records_job_id_idx').on(table.jobId),
    index('records_url_idx').on(table.url),
  ],
);

export type Execute = InferSelectModel<typeof executes>;
export type NewExecute = InferInsertModel<typeof executes>;
export type Job = InferSelectModel<typeof jobs>;
export type NewJob = InferInsertModel<typeof jobs>;
export type CrawlRecord = InferSelectModel<typeof records>;
export type NewCrawlRecord = InferInsertModel<typeof records>;
