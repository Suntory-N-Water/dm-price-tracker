import { stringifyMeta } from '../lib/serialization';
import type { CreatedJob, CreateJobInput } from '../types';

export function createJobs(inputs: readonly CreateJobInput[]): CreatedJob[] {
  return inputs.map((input) => ({
    id: crypto.randomUUID(),
    kind: input.kind,
    status: 'WAITING',
    url: input.url,
    meta: stringifyMeta(input.meta),
    resultCount: 0,
  }));
}
