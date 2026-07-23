import type { WorkflowStep } from 'cloudflare:workers';
import type { CrawlerDatabase } from '../lib/db';
import {
  findWaitingJobs,
  hasIncompleteJobs,
  hasIncompleteJobsInChunk,
  insertInitialState,
  markJobAborted,
  markExecuteFinished,
} from '../lib/repository';
import type {
  Chunk,
  CrawlerEnv,
  Initializer,
  InitializerResult,
} from '../types';
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

    await insertInitialState(this.db, initialized.execute, initialized.jobs);

    return initialized;
  }

  async processJobs(execute: Execute): Promise<void> {
    while (await hasIncompleteJobs(this.db, execute.id)) {
      const waitingJobs = await findWaitingJobs(
        this.db,
        execute.id,
        this.env.CHUNK_SIZE,
      );

      if (waitingJobs.length === 0) {
        await this.step.sleep(
          'wait for running jobs',
          this.env.POLLING_INTERVAL,
        );
        continue;
      }

      const instances = await this.env.JOB_WORKFLOW.createBatch(
        waitingJobs.map((job) => ({
          id: job.id,
          params: { jobId: job.id },
        })),
      );

      await this.pollUntilComplete({
        jobIds: waitingJobs.map((job) => job.id),
        instances,
      });
    }
  }

  async pollUntilComplete(chunk: Chunk): Promise<void> {
    while (await this.isChunkRunning(chunk)) {
      await this.step.sleep('wait for job chunk', this.env.POLLING_INTERVAL);
    }
  }

  async finish(execute: Execute): Promise<void> {
    await this.step.do(
      'finish execute',
      async () => await markExecuteFinished(this.db, execute.id),
    );
  }

  private async isChunkRunning(chunk: Chunk): Promise<boolean> {
    const statuses = await Promise.all(
      chunk.instances.map(async (instance) => await instance.status()),
    );

    if (statuses.some((status) => isRunningStatus(status.status))) {
      return true;
    }

    await Promise.all(
      statuses.map(async (status, index) => {
        const jobId = chunk.jobIds[index];

        if (!jobId || !isFailedStatus(status.status)) {
          return;
        }

        await markJobAborted(this.db, jobId, workflowErrorMessage(status));
      }),
    );

    return await hasIncompleteJobsInChunk(this.db, chunk.jobIds);
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
