import { eq } from 'drizzle-orm';
import {
  BaseJob,
  BaseOrchestrator,
  createExecute,
  createJobs,
  createRecords,
  type InitializerResult,
} from '../../src/index';
import type { CrawlerDatabase } from '../../src/lib/db';
import { jobs, records, type Execute, type Job } from '../../src/lib/schema';

type TestParams = {
  url: string;
  shouldRecordAfterFinishMarker?: boolean;
  shouldFailAfterFinish?: boolean;
};

export const AFTER_FINISH_MARKER_URL = 'after-finish-marker';

export class TestOrchestrator extends BaseOrchestrator<TestParams> {
  private params?: TestParams;

  override initializer(params: TestParams): InitializerResult {
    this.params = params;

    return {
      execute: createExecute(),
      jobs: createJobs([{ url: params.url, kind: 'LIST' }]),
    };
  }

  override async afterFinish(
    execute: Execute,
    db: CrawlerDatabase,
  ): Promise<void> {
    if (this.params?.shouldFailAfterFinish) {
      throw new Error('after finish failed');
    }

    if (!this.params?.shouldRecordAfterFinishMarker) {
      return;
    }

    const rows = await db
      .select({ jobId: records.jobId, data: records.data })
      .from(records)
      .innerJoin(jobs, eq(records.jobId, jobs.id))
      .where(eq(jobs.executeId, execute.id));

    if (rows.length === 0) {
      return;
    }

    await db.insert(records).values(
      rows.map((row) => ({
        id: crypto.randomUUID(),
        jobId: row.jobId,
        url: AFTER_FINISH_MARKER_URL,
        data: row.data,
      })),
    );
  }
}

export class TestJob extends BaseJob {
  override worker(job: Job) {
    return createRecords([
      {
        url: job.url,
        data: {
          kind: job.kind,
          title: 'テストページ',
        },
      },
    ]);
  }
}
