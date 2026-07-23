import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import { createCrawlerDatabase } from '../lib/db';
import { JobService } from './JobService';
import type { CrawlerEnv, JobWorkflowParams, WorkerResult } from '../types';
import type { Job } from '../lib/schema';

export abstract class BaseJob<
  Env extends CrawlerEnv = CrawlerEnv,
> extends WorkflowEntrypoint<Env, JobWorkflowParams> {
  override async run(
    event: WorkflowEvent<JobWorkflowParams>,
    step: WorkflowStep,
  ): Promise<void> {
    const service = new JobService(
      this.env,
      step,
      createCrawlerDatabase(this.env.DB),
    );

    await service.process(event.payload.jobId, this.worker.bind(this));
  }

  abstract worker(job: Job): Promise<WorkerResult> | WorkerResult;
}
