import { stringifyData, stringifyMeta } from '../lib/serialization';
import type { CreatedRecord, CreateRecordInput } from '../types';

export function createRecords(
  inputs: readonly CreateRecordInput[],
): CreatedRecord[] {
  return inputs.map((input) => ({
    id: crypto.randomUUID(),
    url: input.url,
    meta: stringifyMeta(input.meta),
    data: stringifyData(input.data),
  }));
}
