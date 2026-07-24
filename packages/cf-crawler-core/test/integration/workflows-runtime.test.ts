import { env } from 'cloudflare:workers';
import { introspectWorkflowInstance } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { fetchRecords, resetDatabase, testDb } from '../helpers';
import { executes, jobs } from '../../src/lib/schema';
import { AFTER_FINISH_MARKER_URL } from '../fixtures/workflows';

type TestEnv = {
  ORCHESTRATOR: Workflow<{
    url: string;
    shouldRecordAfterFinishMarker?: boolean;
    shouldFailAfterFinish?: boolean;
  }>;
};

beforeEach(async () => {
  await resetDatabase();
});

describe('Workflows runtime統合', () => {
  describe('正常系', () => {
    it('本物のWorkflows bindingで起動する時、起点JobからRecord作成まで完了すること', async () => {
      // Arrange
      const testEnv = env as TestEnv;
      const instanceId = crypto.randomUUID();
      await using instance = await introspectWorkflowInstance(
        testEnv.ORCHESTRATOR,
        instanceId,
      );
      await instance.modify(async (modifier) => {
        await modifier.disableSleeps();
        await modifier.disableRetryDelays();
      });

      // Act
      await testEnv.ORCHESTRATOR.create({
        id: instanceId,
        params: { url: 'https://example.com/runtime' },
      });
      await instance.waitForStatus('complete');

      // Assert
      const [execute] = await testDb.select().from(executes);
      const [job] = await testDb.select().from(jobs);
      const records = await fetchRecords();

      expect(execute).toMatchObject({ status: 'FINISHED' });
      expect(job).toMatchObject({
        status: 'FINISHED',
        url: 'https://example.com/runtime',
        resultCount: 1,
      });
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        jobId: job?.id,
        url: 'https://example.com/runtime',
      });
    });
  });
});

describe('afterFinishフック', () => {
  describe('正常系', () => {
    it('afterFinishが呼ばれる時、そのExecuteに属するRecordを読み取れること', async () => {
      // Arrange
      const testEnv = env as TestEnv;
      const instanceId = crypto.randomUUID();
      await using instance = await introspectWorkflowInstance(
        testEnv.ORCHESTRATOR,
        instanceId,
      );
      await instance.modify(async (modifier) => {
        await modifier.disableSleeps();
        await modifier.disableRetryDelays();
      });

      // Act
      await testEnv.ORCHESTRATOR.create({
        id: instanceId,
        params: {
          url: 'https://example.com/after-finish',
          shouldRecordAfterFinishMarker: true,
        },
      });
      await instance.waitForStatus('complete');

      // Assert
      const allRecords = await fetchRecords();
      const original = allRecords.find(
        (record) => record.url === 'https://example.com/after-finish',
      );
      const marker = allRecords.find(
        (record) => record.url === AFTER_FINISH_MARKER_URL,
      );
      expect(marker?.data).toBe(original?.data);
    });
  });

  describe('異常系', () => {
    it('afterFinishが例外を投げる時、Workflowが失敗として扱われること', async () => {
      // Arrange
      const testEnv = env as TestEnv;
      const instanceId = crypto.randomUUID();
      await using instance = await introspectWorkflowInstance(
        testEnv.ORCHESTRATOR,
        instanceId,
      );
      await instance.modify(async (modifier) => {
        await modifier.disableSleeps();
        await modifier.disableRetryDelays();
      });

      // Act
      await testEnv.ORCHESTRATOR.create({
        id: instanceId,
        params: {
          url: 'https://example.com/after-finish-failure',
          shouldFailAfterFinish: true,
        },
      });
      await instance.waitForStatus('errored');

      // Assert
      const error = await instance.getError();
      const [execute] = await testDb.select().from(executes);
      expect(error.message).toBe('after finish failed');
      expect(execute).toMatchObject({ status: 'ABORTED' });
    });
  });
});
