import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { CrawlerDatabase } from './db';
import { executes, jobs, records, type Execute, type Job } from './schema';
import { parseMeta, stringifyMeta } from './serialization';
import type { CreatedJob, CreatedRecord } from '../types';

const currentTimestamp = sql<string>`CURRENT_TIMESTAMP`;
const INSERT_CHUNK_SIZE = 10;

export async function insertInitialState(
  db: CrawlerDatabase,
  execute: Execute,
  initialJobs: readonly CreatedJob[],
): Promise<void> {
  const executeInsert = db
    .insert(executes)
    .values({
      id: execute.id,
      status: 'RUNNING',
      startedAt: currentTimestamp,
    })
    .returning({ id: executes.id });

  if (initialJobs.length === 0) {
    await executeInsert;
    return;
  }

  await db.batch([
    executeInsert,
    db
      .insert(jobs)
      .values(
        initialJobs.map((job) => ({
          id: job.id,
          executeId: execute.id,
          parentJobId: null,
          kind: job.kind,
          status: 'WAITING' as const,
          url: job.url,
          meta: job.meta,
          resultCount: 0,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: jobs.id }),
  ]);
}

export async function findWaitingJobs(
  db: CrawlerDatabase,
  executeId: string,
  chunkSize: number,
): Promise<Job[]> {
  return await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.executeId, executeId), eq(jobs.status, 'WAITING')))
    .orderBy(asc(jobs.createdAt), asc(jobs.id))
    .limit(chunkSize);
}

export async function findJob(
  db: CrawlerDatabase,
  jobId: string,
): Promise<Job | undefined> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));

  return job;
}

export async function markJobRunning(
  db: CrawlerDatabase,
  jobId: string,
): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: 'RUNNING',
      startedAt: currentTimestamp,
      updatedAt: currentTimestamp,
    })
    .where(eq(jobs.id, jobId));
}

export async function markJobWaiting(
  db: CrawlerDatabase,
  jobId: string,
  error: string,
): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: 'WAITING',
      resultError: error,
      updatedAt: currentTimestamp,
    })
    .where(eq(jobs.id, jobId));
}

export async function markJobAborted(
  db: CrawlerDatabase,
  jobId: string,
  error: string,
): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: 'ABORTED',
      resultError: error,
      updatedAt: currentTimestamp,
    })
    .where(eq(jobs.id, jobId));
}

export async function saveJobRecords(
  db: CrawlerDatabase,
  parentJob: Job,
  createdRecords: readonly CreatedRecord[],
): Promise<void> {
  const rows = createdRecords.map((record) => ({
    id: record.id,
    jobId: parentJob.id,
    url: record.url,
    meta: mergeMeta(parentJob.meta, record.meta),
    data: record.data,
  }));
  const resultCount = rows.length;
  const finish = db
    .update(jobs)
    .set({
      status: 'FINISHED',
      resultCount,
      crawledAt: currentTimestamp,
      updatedAt: currentTimestamp,
    })
    .where(eq(jobs.id, parentJob.id))
    .returning({ id: jobs.id });

  if (rows.length === 0) {
    await finish;
    return;
  }

  const rowChunks = Array.from(
    { length: Math.ceil(rows.length / INSERT_CHUNK_SIZE) },
    (_, index) =>
      rows.slice(index * INSERT_CHUNK_SIZE, (index + 1) * INSERT_CHUNK_SIZE),
  );

  // バインド変数の上限(D1は100個)を超えないよう分割しつつ、jobsの状態更新と
  // 同一バッチに含めてrecords insertとの原子性を保つ。
  const batchQueries: BatchItem<'sqlite'>[] = [
    ...rowChunks.map((rowChunk) =>
      db.insert(records).values(rowChunk).returning({ id: records.id }),
    ),
    finish,
  ];

  // batch()は要素数1以上をコンパイル時に保証するタプル型[T, ...T[]]を要求するが、
  // rowChunksの件数は実行時まで決まらない。drizzle-orm自体のTS定義の制約であり、
  // 開発チームも配列からのキャストを回避策として案内している
  // (https://github.com/drizzle-team/drizzle-orm/issues/1292)。
  // batchQueriesは必ずfinishを含むため要素数1以上が保証される。
  await db.batch(
    batchQueries as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]],
  );
}

export async function saveChildJobs(
  db: CrawlerDatabase,
  parentJob: Job,
  createdJobs: readonly CreatedJob[],
): Promise<void> {
  const rows = createdJobs.map((job) => ({
    id: job.id,
    executeId: parentJob.executeId,
    parentJobId: parentJob.id,
    kind: job.kind,
    status: 'WAITING' as const,
    url: job.url,
    meta: mergeMeta(parentJob.meta, job.meta),
    resultCount: 0,
  }));
  const rowChunks = Array.from(
    { length: Math.ceil(rows.length / INSERT_CHUNK_SIZE) },
    (_, index) =>
      rows.slice(index * INSERT_CHUNK_SIZE, (index + 1) * INSERT_CHUNK_SIZE),
  );
  const inserted: { id: string }[] = [];

  for (const rowChunk of rowChunks) {
    inserted.push(
      ...(await db
        .insert(jobs)
        .values(rowChunk)
        .onConflictDoNothing()
        .returning({ id: jobs.id })),
    );
  }

  await db
    .update(jobs)
    .set({
      status: 'FINISHED',
      resultCount: inserted.length,
      crawledAt: currentTimestamp,
      updatedAt: currentTimestamp,
    })
    .where(eq(jobs.id, parentJob.id));
}

export async function hasIncompleteJobs(
  db: CrawlerDatabase,
  executeId: string,
): Promise<boolean> {
  const [job] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.executeId, executeId),
        inArray(jobs.status, ['WAITING', 'RUNNING']),
      ),
    )
    .limit(1);

  return job !== undefined;
}

export async function hasIncompleteJobsInChunk(
  db: CrawlerDatabase,
  jobIds: readonly string[],
): Promise<boolean> {
  if (jobIds.length === 0) {
    return false;
  }

  const [job] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        inArray(jobs.id, [...jobIds]),
        inArray(jobs.status, ['WAITING', 'RUNNING']),
      ),
    )
    .limit(1);

  return job !== undefined;
}

export async function markExecuteFinished(
  db: CrawlerDatabase,
  executeId: string,
): Promise<void> {
  await db
    .update(executes)
    .set({
      status: 'FINISHED',
      updatedAt: currentTimestamp,
    })
    .where(eq(executes.id, executeId));
}

function mergeMeta(parentMeta: string, childMeta: string): string {
  return stringifyMeta({
    ...parseMeta(parentMeta),
    ...parseMeta(childMeta),
  });
}
