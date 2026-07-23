import type { Execute } from '../lib/schema';

export function createExecute(): Execute {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    status: 'WAITING',
    startedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
