import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import { createCrawlerDatabase, type CrawlerDatabase } from '../lib/db';
import { OrchestratorService } from './OrchestratorService';
import type { CrawlerEnv, InitializerResult } from '../types';
import type { Execute } from '../lib/schema';

export abstract class BaseOrchestrator<
  Params = unknown,
  Env extends CrawlerEnv = CrawlerEnv,
> extends WorkflowEntrypoint<Env, Params> {
  override async run(
    event: WorkflowEvent<Params>,
    step: WorkflowStep,
  ): Promise<InitializerResult> {
    const db = createCrawlerDatabase(this.env.DB);
    const service = new OrchestratorService<Params>(this.env, step, db);
    const initialized = await service.initialize(
      event.payload,
      this.initializer.bind(this),
    );

    try {
      await service.processJobs(initialized.execute);
      await service.finish(initialized.execute);
      await step.do(
        'after finish hook',
        async () => await this.afterFinish(initialized.execute, db),
      );
    } catch (error) {
      await service.abort(initialized.execute);
      throw error;
    }

    return initialized;
  }

  abstract initializer(
    params: Params,
  ): Promise<InitializerResult> | InitializerResult;

  afterFinish(_execute: Execute, _db: CrawlerDatabase): Promise<void> | void {}
}
