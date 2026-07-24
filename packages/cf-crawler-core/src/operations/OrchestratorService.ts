import type { WorkflowStep } from 'cloudflare:workers';
import type { CrawlerDatabase } from '../lib/db';
import {
  findWaitingJobs,
  hasIncompleteJobs,
  hasIncompleteJobsInChunk,
  insertInitialState,
  markExecuteAborted,
  markJobAborted,
  markExecuteFinished,
} from '../lib/repository';
import type { CrawlerEnv, Initializer, InitializerResult } from '../types';
import type { Execute } from '../lib/schema';

export class OrchestratorService<Params = unknown> {
  constructor(
    private readonly env: CrawlerEnv,
    private readonly step: WorkflowStep,
    private readonly db: CrawlerDatabase,
  ) {}

  async initialize(
    params: Params,
    initializer: Initializer<Params>,
  ): Promise<InitializerResult> {
    const initialized = await this.step.do(
      'initialize crawl',
      async () => await initializer(params),
    );

    await this.step.do(
      'save initial crawl state',
      async () =>
        await insertInitialState(
          this.db,
          initialized.execute,
          initialized.jobs,
        ),
    );

    return initialized;
  }

  async processJobs(execute: Execute): Promise<void> {
    for (;;) {
      const chunk = await this.step.do('select next job chunk', async () => {
        const waitingJobs = await findWaitingJobs(
          this.db,
          execute.id,
          this.env.CHUNK_SIZE,
        );

        return {
          hasIncompleteJobs: await hasIncompleteJobs(this.db, execute.id),
          jobIds: waitingJobs.map((job) => job.id),
        };
      });

      if (!chunk.hasIncompleteJobs) {
        return;
      }

      if (chunk.jobIds.length === 0) {
        await this.step.sleep(
          'wait for running jobs',
          this.env.POLLING_INTERVAL,
        );
        continue;
      }

      await this.step.do('start job chunk', async () => {
        await this.env.JOB_WORKFLOW.createBatch(
          chunk.jobIds.map((jobId) => ({
            id: jobId,
            params: { jobId },
          })),
        );
      });

      await this.pollUntilComplete(chunk.jobIds);
    }
  }

  async pollUntilComplete(jobIds: readonly string[]): Promise<void> {
    while (
      await this.step.do(
        'check job chunk',
        async () => await this.isChunkRunning(jobIds),
      )
    ) {
      await this.step.sleep('wait for job chunk', this.env.POLLING_INTERVAL);
    }
  }

  async finish(execute: Execute): Promise<void> {
    await this.step.do(
      'finish execute',
      async () => await markExecuteFinished(this.db, execute.id),
    );
  }

  async abort(execute: Execute): Promise<void> {
    await this.step.do(
      'abort execute',
      async () => await markExecuteAborted(this.db, execute.id),
    );
  }

  private async isChunkRunning(jobIds: readonly string[]): Promise<boolean> {
    const statuses = await Promise.all(
      jobIds.map(async (jobId) => {
        const instance = await this.env.JOB_WORKFLOW.get(jobId);
        return await instance.status();
      }),
    );

    if (statuses.some((status) => isRunningStatus(status.status))) {
      return true;
    }

    await Promise.all(
      statuses.map(async (status, index) => {
        const jobId = jobIds[index];

        if (!jobId || !isFailedStatus(status.status)) {
          return;
        }

        await markJobAborted(this.db, jobId, workflowErrorMessage(status));
      }),
    );

    return await hasIncompleteJobsInChunk(this.db, jobIds);
  }
}

type WorkflowStatus = Awaited<ReturnType<WorkflowInstance['status']>>['status'];
type InstanceStatus = Awaited<ReturnType<WorkflowInstance['status']>>;

function isRunningStatus(status: WorkflowStatus): boolean {
  return (
    status === 'queued' ||
    status === 'running' ||
    status === 'waiting' ||
    status === 'waitingForPause'
  );
}

function isFailedStatus(status: WorkflowStatus): boolean {
  return status === 'errored' || status === 'terminated';
}

function workflowErrorMessage(status: InstanceStatus): string {
  return (
    status.error?.message ?? `Job Workflowが異常終了しました: ${status.status}`
  );
}
