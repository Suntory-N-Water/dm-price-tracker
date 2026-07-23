import type { WorkflowStep } from 'cloudflare:workers';
import type { CrawlerDatabase } from '../lib/db';
import {
  findJob,
  markJobAborted,
  markJobRunning,
  saveChildJobs,
  saveJobRecords,
} from '../lib/repository';
import type {
  CreatedJob,
  CreatedRecord,
  CrawlerEnv,
  JobWorker,
} from '../types';

export class JobService {
  constructor(
    private readonly env: CrawlerEnv,
    private readonly step: WorkflowStep,
    private readonly db: CrawlerDatabase,
  ) {}

  async process(jobId: string, worker: JobWorker): Promise<void> {
    const job = await findJob(this.db, jobId);

    if (!job) {
      throw new Error(`Job ${jobId} was not found.`);
    }

    await markJobRunning(this.db, job.id);

    try {
      const result = await this.step.do(
        `process job ${job.id}`,
        {
          retries: {
            limit: this.env.RETRY_LIMIT,
            delay: '1 second',
            backoff: 'exponential',
          },
        },
        async () => await worker({ ...job, status: 'RUNNING' }),
      );

      await this.saveResult(job, result ?? []);
    } catch (error) {
      await markJobAborted(this.db, job.id, errorMessage(error));
    }
  }

  private async saveResult(
    job: NonNullable<Awaited<ReturnType<typeof findJob>>>,
    result: CreatedJob[] | CreatedRecord[],
  ): Promise<void> {
    if (isCreatedRecords(result)) {
      await saveJobRecords(this.db, job, result);
      return;
    }

    await saveChildJobs(this.db, job, result);
  }
}

function isCreatedRecords(
  result: CreatedJob[] | CreatedRecord[],
): result is CreatedRecord[] {
  return result.some((item) => 'data' in item);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
