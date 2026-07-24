import type { WorkflowSleepDuration } from 'cloudflare:workers';
import type { Execute, Job } from './lib/schema';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Meta = Record<string, unknown>;

export type CreateJobInput = {
  url: string;
  kind: string;
  meta?: Meta;
};

export type CreatedJob = {
  id: string;
  kind: string;
  status: 'WAITING';
  url: string;
  meta: string;
  resultCount: 0;
};

export type CreateRecordInput = {
  url: string;
  data: JsonValue;
  meta?: Meta;
};

export type CreatedRecord = {
  id: string;
  url: string;
  meta: string;
  data: string;
};

export type InitializerResult = {
  execute: Execute;
  jobs: CreatedJob[];
};

export type WorkerResult = CreatedJob[] | CreatedRecord[] | undefined;

export type Initializer<Params> = (
  params: Params,
) => Promise<InitializerResult> | InitializerResult;

export type JobWorker = (job: Job) => Promise<WorkerResult> | WorkerResult;

export type JobWorkflowParams = {
  jobId: string;
};

export type CrawlerEnv = {
  DB: D1Database;
  ORCHESTRATOR: Workflow<unknown>;
  JOB_WORKFLOW: Workflow<JobWorkflowParams>;
  CHUNK_SIZE: number;
  RETRY_LIMIT: number;
  POLLING_INTERVAL: WorkflowSleepDuration;
};
