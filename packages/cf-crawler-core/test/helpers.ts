import { env } from 'cloudflare:workers';
import { asc, eq } from 'drizzle-orm';
import { createCrawlerDatabase } from '../src/lib/db';
import { executes, jobs, records } from '../src/lib/schema';

type TestEnv = {
  DB: D1Database;
};

export const testRawDb = (env as TestEnv).DB;
export const testDb = createCrawlerDatabase(testRawDb);

export async function resetDatabase(): Promise<void> {
  await testDb.delete(records);
  await testDb.delete(jobs);
  await testDb.delete(executes);
}

export async function fetchExecute(id: string) {
  const [execute] = await testDb
    .select()
    .from(executes)
    .where(eq(executes.id, id));

  if (!execute) {
    throw new Error(`Execute ${id} was not found.`);
  }

  return execute;
}

export async function fetchJob(id: string) {
  const [job] = await testDb.select().from(jobs).where(eq(jobs.id, id));

  if (!job) {
    throw new Error(`Job ${id} was not found.`);
  }

  return job;
}

export async function fetchJobs(executeId: string) {
  return await testDb
    .select()
    .from(jobs)
    .where(eq(jobs.executeId, executeId))
    .orderBy(asc(jobs.createdAt), asc(jobs.id));
}

export async function fetchRecords() {
  return await testDb
    .select()
    .from(records)
    .orderBy(asc(records.createdAt), asc(records.id));
}
