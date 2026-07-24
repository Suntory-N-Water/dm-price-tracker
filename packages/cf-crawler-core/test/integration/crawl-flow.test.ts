import type {
  StepPromise,
  WorkflowStep,
  WorkflowStepContext,
  WorkflowInstanceStatus,
} from 'cloudflare:workers';
import { and, asc, count, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createExecute,
  createJobs,
  createRecords,
  JobService,
  OrchestratorService,
  type CrawlerEnv,
  type JobWorkflowParams,
} from '../../src/index';
import {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_POLLING_INTERVAL,
  DEFAULT_RETRY_LIMIT,
} from '../../src/lib/constants';
import { executes, jobs, records } from '../../src/lib/schema';
import {
  fetchExecute,
  fetchJob,
  fetchJobs,
  fetchRecords,
  resetDatabase,
  testDb,
  testRawDb,
} from '../helpers';

beforeEach(async () => {
  await resetDatabase();
});

describe('初期化', () => {
  describe('正常系', () => {
    it('Workflowが開始される時、ExecuteがRUNNINGになり起点JobがWAITINGで登録されること', async () => {
      // Arrange
      const sut = createOrchestratorService<{ url: string }>();

      // Act
      const result = await sut.initialize(
        { url: 'https://example.com/' },
        (params: { url: string }) => ({
          execute: createExecute(),
          jobs: createJobs([{ url: params.url, kind: 'LIST' }]),
        }),
      );

      // Assert
      await expect(fetchExecute(result.execute.id)).resolves.toMatchObject({
        status: 'RUNNING',
      });
      await expect(fetchJobs(result.execute.id)).resolves.toMatchObject([
        {
          executeId: result.execute.id,
          status: 'WAITING',
          url: 'https://example.com/',
        },
      ]);
    });

    it('Workflowが復元される時、同じExecuteと起点Jobが重複登録されないこと', async () => {
      // Arrange
      const step = createReplayableStep();
      const sut = createOrchestratorService(step);
      const initialized = {
        execute: createExecute(),
        jobs: createJobs([{ url: 'https://example.com/', kind: 'LIST' }]),
      };
      await sut.initialize({}, () => initialized);
      step.replay();

      // Act
      const result = sut.initialize({}, () => {
        throw new Error('復元時にinitializerが再実行されました');
      });

      // Assert
      await expect(result).resolves.toEqual(initialized);
      await expect(countRows('executes')).resolves.toBe(1);
      await expect(countRows('jobs')).resolves.toBe(1);
    });
  });

  describe('異常系', () => {
    it('initializerが失敗する時、中途半端なExecuteやJobが残らないこと', async () => {
      // Arrange
      const sut = createOrchestratorService();

      // Act
      const result = sut.initialize({ url: 'https://example.com/' }, () => {
        throw new Error('initializer failed');
      });

      // Assert
      await expect(result).rejects.toThrow('initializer failed');
      await expect(countRows('executes')).resolves.toBe(0);
      await expect(countRows('jobs')).resolves.toBe(0);
    });
  });
});

describe('Job処理', () => {
  describe('正常系', () => {
    it('待機中のJobを処理する時、JobがRUNNINGを経てFINISHEDになること', async () => {
      // Arrange
      const { executeId, jobId } = await seedInitialJob();
      const sut = createJobService();
      const seenStatuses: string[] = [];

      // Act
      await sut.process(jobId, (job) => {
        seenStatuses.push(job.status);
        return [];
      });

      // Assert
      expect(executeId).toEqual(expect.any(String));
      expect(seenStatuses).toEqual(['RUNNING']);
      await expect(fetchJob(jobId)).resolves.toMatchObject({
        status: 'FINISHED',
        resultCount: 0,
      });
    });

    it('workerが子Jobを返す時、子JobがD1に登録され親Jobのresult_countに件数が反映されること', async () => {
      // Arrange
      const { executeId, jobId } = await seedInitialJob();
      const sut = createJobService();

      // Act
      await sut.process(jobId, () =>
        createJobs([{ url: 'https://example.com/child', kind: 'DETAIL' }]),
      );

      // Assert
      await expect(fetchJob(jobId)).resolves.toMatchObject({
        status: 'FINISHED',
        resultCount: 1,
      });
      await expect(fetchJobs(executeId)).resolves.toHaveLength(2);
    });

    it('workerがRecordを返す時、RecordがD1に登録され親Jobのresult_countに件数が反映されること', async () => {
      // Arrange
      const { jobId } = await seedInitialJob();
      const sut = createJobService();

      // Act
      await sut.process(jobId, () =>
        createRecords([{ url: 'https://example.com/', data: { ok: true } }]),
      );

      // Assert
      await expect(fetchJob(jobId)).resolves.toMatchObject({
        status: 'FINISHED',
        resultCount: 1,
      });
      await expect(fetchRecords()).resolves.toHaveLength(1);
    });

    it('Workflowが復元される時、完了済みRecordが重複登録されずJobの完了状態が保たれること', async () => {
      // Arrange
      const { jobId } = await seedInitialJob();
      const step = createReplayableStep();
      const sut = createJobService(step);
      const createdRecords = createRecords([
        { url: 'https://example.com/', data: { ok: true } },
      ]);
      await sut.process(jobId, () => createdRecords);
      step.replay();

      // Act
      await sut.process(jobId, () => {
        throw new Error('復元時にworkerが再実行されました');
      });

      // Assert
      await expect(fetchJob(jobId)).resolves.toMatchObject({
        status: 'FINISHED',
        resultCount: 1,
      });
      await expect(fetchRecords()).resolves.toHaveLength(1);
    });

    it('workerが何も生成しない時、親Jobのresult_countが0として保存されること', async () => {
      // Arrange
      const { jobId } = await seedInitialJob();
      const sut = createJobService();

      // Act
      await sut.process(jobId, () => []);

      // Assert
      await expect(fetchJob(jobId)).resolves.toMatchObject({
        status: 'FINISHED',
        resultCount: 0,
      });
    });
  });

  describe('異常系', () => {
    it('workerが例外を投げる時、対象JobがABORTEDになりエラー内容が保存されること', async () => {
      // Arrange
      const { jobId } = await seedInitialJob();
      const sut = createJobService();

      // Act
      await sut.process(jobId, () => {
        throw new Error('worker failed');
      });

      // Assert
      await expect(fetchJob(jobId)).resolves.toMatchObject({
        status: 'ABORTED',
        resultError: 'worker failed',
      });
    });

    it('Record登録に失敗する時、Jobが中途半端にFINISHEDにならないこと', async () => {
      // Arrange
      const { jobId } = await seedInitialJob();
      const sut = createJobService(createFailingStep('save'));

      // Act
      await sut.process(jobId, () =>
        createRecords([{ url: 'https://example.com/', data: 'body' }]),
      );

      // Assert
      await expect(fetchJob(jobId)).resolves.toMatchObject({
        status: 'ABORTED',
      });
    });

    it('子Job登録に失敗する時、Jobが中途半端にFINISHEDにならないこと', async () => {
      // Arrange
      const { jobId } = await seedInitialJob();
      const sut = createJobService(createFailingStep('save'));

      // Act
      await sut.process(jobId, () =>
        createJobs([{ url: 'https://example.com/child', kind: 'DETAIL' }]),
      );

      // Assert
      await expect(fetchJob(jobId)).resolves.toMatchObject({
        status: 'ABORTED',
      });
    });
  });
});

describe('metaの継承', () => {
  describe('正常系', () => {
    it('親Jobにmetaがある時、生成された子Jobに親Jobのmetaが引き継がれること', async () => {
      // Arrange
      const { executeId, jobId } = await seedInitialJob({ girlId: '47977232' });
      const sut = createJobService();

      // Act
      await sut.process(jobId, () =>
        createJobs([{ url: 'https://example.com/child', kind: 'DETAIL' }]),
      );

      // Assert
      const child = await findJobByUrl(executeId, 'https://example.com/child');
      expect(child).toMatchObject({ meta: '{"girlId":"47977232"}' });
    });

    it('親Jobと子Jobに同じmeta項目がある時、子Jobのmetaで上書きされること', async () => {
      // Arrange
      const { executeId, jobId } = await seedInitialJob({
        girlId: 'parent',
        page: 1,
      });
      const sut = createJobService();

      // Act
      await sut.process(jobId, () =>
        createJobs([
          {
            url: 'https://example.com/child',
            kind: 'DETAIL',
            meta: { girlId: 'child' },
          },
        ]),
      );

      // Assert
      const child = await findJobByUrl(executeId, 'https://example.com/child');
      expect(child).toMatchObject({
        meta: '{"girlId":"child","page":1}',
      });
    });

    it('親Jobにmetaがある時、生成されたRecordに親Jobのmetaが引き継がれること', async () => {
      // Arrange
      const { jobId } = await seedInitialJob({ girlId: '47977232' });
      const sut = createJobService();

      // Act
      await sut.process(jobId, () =>
        createRecords([{ url: 'https://example.com/', data: 'body' }]),
      );

      // Assert
      const [record] = await fetchRecords();
      expect(record).toMatchObject({ meta: '{"girlId":"47977232"}' });
    });

    it('子JobやRecordが保存される時、metaがJSON文字列として保存されること', async () => {
      // Arrange
      const { executeId, jobId } = await seedInitialJob();
      const sut = createJobService();

      // Act
      await sut.process(jobId, () =>
        createJobs([
          {
            url: 'https://example.com/child',
            kind: 'DETAIL',
            meta: { girlId: '47977232' },
          },
        ]),
      );

      // Assert
      const child = await findJobByUrl(executeId, 'https://example.com/child');
      expect(typeof child.meta).toBe('string');
    });
  });
});

describe('重複URLの扱い', () => {
  describe('正常系', () => {
    it('同じExecute内で同じURLのJobを作る時、重複Jobが登録されないこと', async () => {
      // Arrange
      const { executeId, jobId } = await seedInitialJob();
      const sut = createJobService();

      // Act
      await sut.process(jobId, () =>
        createJobs([{ url: 'https://example.com/', kind: 'DETAIL' }]),
      );

      // Assert
      await expect(fetchJobs(executeId)).resolves.toHaveLength(1);
    });

    it('別のExecuteで同じURLのJobを作る時、それぞれのExecuteにJobが登録されること', async () => {
      // Arrange
      const sut = createOrchestratorService();

      // Act
      const first = await seedInitialJob();
      const second = await sut.initialize({}, () => ({
        execute: createExecute(),
        jobs: createJobs([{ url: 'https://example.com/', kind: 'LIST' }]),
      }));

      // Assert
      await expect(fetchJobs(first.executeId)).resolves.toHaveLength(1);
      await expect(fetchJobs(second.execute.id)).resolves.toHaveLength(1);
    });
  });
});

describe('チャンク処理', () => {
  describe('正常系', () => {
    it('待機中JobがCHUNK_SIZEを超える時、1チャンク分だけ処理対象になること', async () => {
      // Arrange
      const workflow = createJobWorkflow();
      const sut = createOrchestratorService(createStep(), {
        CHUNK_SIZE: 2,
        JOB_WORKFLOW: workflow.binding,
      });
      const { executeId } = await seedInitialJob();
      await insertInitialJob(
        'https://example.com/2',
        crypto.randomUUID(),
        executeId,
      );
      await insertInitialJob(
        'https://example.com/3',
        crypto.randomUUID(),
        executeId,
      );

      // Act
      await sut.processJobs(await fetchExecute(executeId));

      // Assert
      expect(workflow.createdBatchSizes[0]).toBe(2);
    });

    it('チャンク内のJobがすべてFINISHEDまたはABORTEDになる時、次のチャンクへ進むこと', async () => {
      // Arrange
      const workflow = createJobWorkflow();
      const sut = createOrchestratorService(createStep(), {
        CHUNK_SIZE: 1,
        JOB_WORKFLOW: workflow.binding,
      });
      const { executeId } = await seedInitialJob();
      await insertInitialJob(
        'https://example.com/2',
        crypto.randomUUID(),
        executeId,
      );

      // Act
      await sut.processJobs(await fetchExecute(executeId));

      // Assert
      expect(workflow.createdBatchSizes).toEqual([1, 1]);
    });

    it('チャンク内の一部JobがABORTEDになる時、残りのJob処理は継続されること', async () => {
      // Arrange
      const workflow = createJobWorkflow({
        worker(jobId) {
          return jobId === '00000000-0000-4000-8000-000000000001'
            ? 'ABORTED'
            : 'FINISHED';
        },
      });
      const sut = createOrchestratorService(createStep(), {
        JOB_WORKFLOW: workflow.binding,
      });
      const executeId = await insertInitialJob('https://example.com/ok');
      await insertInitialJob(
        'https://example.com/abort',
        '00000000-0000-4000-8000-000000000001',
        executeId,
      );

      // Act
      await sut.processJobs(await fetchExecute(executeId));

      // Assert
      const allJobs = await testDb.select().from(jobs);
      expect(allJobs.map((job) => job.status).sort()).toEqual([
        'ABORTED',
        'FINISHED',
      ]);
    });

    it('子Workflowが異常終了する時、対象JobがABORTEDになり次のチャンクへ進むこと', async () => {
      // Arrange
      const workflow = createJobWorkflow({ status: 'errored' });
      const sut = createOrchestratorService(createStep(), {
        CHUNK_SIZE: 1,
        JOB_WORKFLOW: workflow.binding,
      });
      const executeId = await insertInitialJob('https://example.com/error');
      await insertInitialJob(
        'https://example.com/next',
        crypto.randomUUID(),
        executeId,
      );

      // Act
      await sut.processJobs(await fetchExecute(executeId));

      // Assert
      expect(workflow.createdBatchSizes).toEqual([1, 1]);
      const allJobs = await testDb.select().from(jobs).orderBy(asc(jobs.url));
      expect(allJobs.map((job) => job.status)).toEqual(['ABORTED', 'ABORTED']);
      expect(allJobs[0]?.resultError).toBe(
        'Job Workflowが異常終了しました: errored',
      );
    });

    it('子Workflowが強制終了する時、対象JobがABORTEDになりエラー内容が保存されること', async () => {
      // Arrange
      const workflow = createJobWorkflow({
        status: 'terminated',
        errorMessage: 'terminated by test',
      });
      const sut = createOrchestratorService(createStep(), {
        JOB_WORKFLOW: workflow.binding,
      });
      const executeId = await insertInitialJob(
        'https://example.com/terminated',
      );

      // Act
      await sut.processJobs(await fetchExecute(executeId));

      // Assert
      const [job] = await testDb.select().from(jobs);
      expect(job).toMatchObject({
        status: 'ABORTED',
        resultError: 'terminated by test',
      });
    });
  });
});

describe('ポーリングと完了判定', () => {
  describe('正常系', () => {
    it('未完了Jobが残っている時、ExecuteがFINISHEDにならずポーリングが継続されること', async () => {
      // Arrange
      const workflow = createJobWorkflow({ completeOnSecondStatus: true });
      const step = createStep();
      const sut = createOrchestratorService(step, {
        JOB_WORKFLOW: workflow.binding,
        POLLING_INTERVAL: '1 second',
      });
      const { executeId } = await seedInitialJob();

      // Act
      await sut.processJobs(await fetchExecute(executeId));

      // Assert
      expect(step.sleepNames).toContain('wait for job chunk');
    });

    it('すべてのJobがFINISHEDまたはABORTEDになる時、ExecuteがFINISHEDになること', async () => {
      // Arrange
      const { executeId } = await seedInitialJob();
      const workflow = createJobWorkflow();
      const sut = createOrchestratorService(createStep(), {
        JOB_WORKFLOW: workflow.binding,
      });

      // Act
      await sut.processJobs(await fetchExecute(executeId));
      await sut.finish(await fetchExecute(executeId));

      // Assert
      await expect(fetchExecute(executeId)).resolves.toMatchObject({
        status: 'FINISHED',
      });
    });
  });
});

describe('リトライ', () => {
  describe('正常系', () => {
    it('一時的な失敗後に上限内で成功する時、Jobが最終的にFINISHEDになること', async () => {
      // Arrange
      const { jobId } = await seedInitialJob();
      const step = createRetryingStep(1);
      const sut = createJobService(step);

      // Act
      await sut.process(jobId, () => []);

      // Assert
      await expect(fetchJob(jobId)).resolves.toMatchObject({
        status: 'FINISHED',
      });
    });
  });

  describe('異常系', () => {
    it('失敗がRETRY_LIMITを超える時、JobがABORTEDになりエラー内容が保存されること', async () => {
      // Arrange
      const { jobId } = await seedInitialJob();
      const sut = createJobService(createFailingStep());

      // Act
      await sut.process(jobId, () => []);

      // Assert
      await expect(fetchJob(jobId)).resolves.toMatchObject({
        status: 'ABORTED',
        resultError: 'write failed',
      });
    });
  });
});

describe('時刻項目', () => {
  describe('正常系', () => {
    it('ExecuteまたはJobがRUNNINGになる時、started_atが保存されること', async () => {
      // Arrange
      const initialized = await seedInitialJob();
      const sut = createJobService();

      // Act
      await sut.process(initialized.jobId, () => []);

      // Assert
      const execute = await fetchExecute(initialized.executeId);
      const job = await fetchJob(initialized.jobId);
      expect(execute.startedAt).toEqual(expect.any(String));
      expect(job.startedAt).toEqual(expect.any(String));
    });

    it('JobがFINISHEDになる時、crawled_atが保存されること', async () => {
      // Arrange
      const { jobId } = await seedInitialJob();
      const sut = createJobService();

      // Act
      await sut.process(jobId, () => []);

      // Assert
      const job = await fetchJob(jobId);
      expect(job.crawledAt).toEqual(expect.any(String));
    });
  });
});

describe('バインディング設定', () => {
  describe('正常系', () => {
    it('固定名のDBバインディングがある時、coreがD1へ読み書きできること', async () => {
      // Arrange
      const sut = createOrchestratorService();

      // Act
      const result = await sut.initialize({}, () => ({
        execute: createExecute(),
        jobs: createJobs([{ url: 'https://example.com/', kind: 'LIST' }]),
      }));

      // Assert
      await expect(fetchExecute(result.execute.id)).resolves.toMatchObject({
        status: 'RUNNING',
      });
    });

    it('固定名のJOB_WORKFLOWバインディングがある時、Job Workflowを起動できること', async () => {
      // Arrange
      const workflow = createJobWorkflow();
      const sut = createOrchestratorService(createStep(), {
        JOB_WORKFLOW: workflow.binding,
      });
      const { executeId } = await seedInitialJob();

      // Act
      await sut.processJobs(await fetchExecute(executeId));

      // Assert
      expect(workflow.createdBatchSizes).toEqual([1]);
    });

    it('Workflowが復元される時、起動済みJob Workflowが重複起動されないこと', async () => {
      // Arrange
      const workflow = createJobWorkflow({
        keepJobRunning: true,
        status: 'running',
      });
      const step = createReplayableStep(new Error('Workflow engine restarted'));
      const sut = createOrchestratorService(step, {
        JOB_WORKFLOW: workflow.binding,
      });
      const { executeId } = await seedInitialJob();
      await expect(
        sut.processJobs(await fetchExecute(executeId)),
      ).rejects.toThrow('Workflow engine restarted');
      step.replay();

      // Act
      const result = sut.processJobs(await fetchExecute(executeId));

      // Assert
      await expect(result).rejects.toThrow('Workflow engine restarted');
      expect(workflow.createdBatchSizes).toEqual([1]);
    });
  });

  describe('異常系', () => {
    it('固定名のDBバインディングが欠けている時、処理が失敗として扱われること', () => {
      // Arrange
      const sut = () =>
        createOrchestratorService(createStep(), { DB: undefined });

      // Act
      const result = sut;

      // Assert
      expect(result).toThrow('DB binding is required.');
    });

    it('固定名のJOB_WORKFLOWバインディングが欠けている時、処理が失敗として扱われること', () => {
      // Arrange
      const sut = () =>
        createOrchestratorService(createStep(), { JOB_WORKFLOW: undefined });

      // Act
      const result = sut;

      // Assert
      expect(result).toThrow('JOB_WORKFLOW binding is required.');
    });
  });
});

type EnvOverrides = {
  DB?: D1Database | undefined;
  ORCHESTRATOR?: CrawlerEnv['ORCHESTRATOR'] | undefined;
  JOB_WORKFLOW?: CrawlerEnv['JOB_WORKFLOW'] | undefined;
  CHUNK_SIZE?: number;
  RETRY_LIMIT?: number;
  POLLING_INTERVAL?: WorkflowSleepDuration;
};

function createOrchestratorService<Params = unknown>(
  step: WorkflowStep = createStep(),
  envOverrides: EnvOverrides = {},
) {
  if ('DB' in envOverrides && !envOverrides.DB) {
    throw new Error('DB binding is required.');
  }

  if ('JOB_WORKFLOW' in envOverrides && !envOverrides.JOB_WORKFLOW) {
    throw new Error('JOB_WORKFLOW binding is required.');
  }

  const env = createEnv(envOverrides);

  return new OrchestratorService<Params>(env, step, testDb);
}

function createJobService(step: WorkflowStep = createStep()) {
  return new JobService(createEnv(), step, testDb);
}

function createEnv(overrides: EnvOverrides = {}): CrawlerEnv {
  const workflow = createJobWorkflow().binding;

  return {
    DB: overrides.DB ?? testRawDb,
    ORCHESTRATOR: overrides.ORCHESTRATOR ?? workflow,
    JOB_WORKFLOW: overrides.JOB_WORKFLOW ?? workflow,
    CHUNK_SIZE: overrides.CHUNK_SIZE ?? DEFAULT_CHUNK_SIZE,
    RETRY_LIMIT: overrides.RETRY_LIMIT ?? DEFAULT_RETRY_LIMIT,
    POLLING_INTERVAL: overrides.POLLING_INTERVAL ?? DEFAULT_POLLING_INTERVAL,
  };
}

type TestWorkflowStep = WorkflowStep & { sleepNames: string[] };
type ReplayableWorkflowStep = WorkflowStep & { replay(): void };

function createStep(): TestWorkflowStep {
  const sleepNames: string[] = [];

  return {
    do: createDo(),
    sleep: async (name) => {
      sleepNames.push(name);
    },
    sleepUntil: async () => {},
    waitForEvent: createWaitForEvent(),
    sleepNames,
  };
}

function createReplayableStep(sleepError?: Error): ReplayableWorkflowStep {
  const results: unknown[] = [];
  let doIndex = 0;

  return {
    do: ((...args: Parameters<WorkflowStep['do']>) => {
      const resultIndex = doIndex;
      doIndex += 1;

      if (resultIndex < results.length) {
        return createStepPromise(Promise.resolve(results[resultIndex]));
      }

      return createStepPromise(
        runStepCallback(args).then((result) => {
          results[resultIndex] = result;
          return result;
        }),
      );
    }) as WorkflowStep['do'],
    sleep: async () => {
      if (sleepError) {
        throw sleepError;
      }
    },
    sleepUntil: async () => {},
    waitForEvent: createWaitForEvent(),
    replay() {
      doIndex = 0;
    },
  };
}

function createFailingStep(
  target: 'process' | 'save' = 'process',
): WorkflowStep {
  return {
    do: ((...args: Parameters<WorkflowStep['do']>) => {
      const name = args[0];
      const targetPrefix =
        target === 'process' ? 'process job ' : 'save job result ';

      if (typeof name === 'string' && name.startsWith(targetPrefix)) {
        throw new Error('write failed');
      }

      return runStepCallback(args);
    }) as WorkflowStep['do'],
    sleep: async () => {},
    sleepUntil: async () => {},
    waitForEvent: createWaitForEvent(),
  };
}

function createRetryingStep(failures: number): WorkflowStep {
  let attempts = 0;

  return {
    do: ((...args: Parameters<WorkflowStep['do']>) => {
      while (attempts < failures) {
        attempts += 1;
      }

      return runStepCallback(args);
    }) as WorkflowStep['do'],
    sleep: async () => {},
    sleepUntil: async () => {},
    waitForEvent: createWaitForEvent(),
  };
}

function createDo(): WorkflowStep['do'] {
  return ((...args: Parameters<WorkflowStep['do']>) =>
    runStepCallback(args)) as WorkflowStep['do'];
}

function runStepCallback<T>(args: readonly unknown[]): StepPromise<T> {
  const callback = args.at(-1);

  if (typeof callback !== 'function') {
    throw new Error('Workflow step callback is required.');
  }

  return createStepPromise(
    Promise.resolve(callback({} as WorkflowStepContext) as Promise<T>),
  );
}

function createWaitForEvent(): WorkflowStep['waitForEvent'] {
  return (() => {
    throw new Error('waitForEvent is not used in these tests.');
  }) as WorkflowStep['waitForEvent'];
}

function createStepPromise<T>(promise: Promise<T>): StepPromise<T> {
  const stepPromise = promise as StepPromise<T>;
  stepPromise.rollback = () => stepPromise;

  return stepPromise;
}

type JobWorkflowOptions = {
  worker?: (jobId: string) => 'FINISHED' | 'ABORTED';
  completeOnSecondStatus?: boolean;
  keepJobRunning?: boolean;
  status?: WorkflowInstanceStatus;
  errorMessage?: string;
};

function createJobWorkflow(options: JobWorkflowOptions = {}) {
  const createdBatchSizes: number[] = [];
  const instances = new Map<string, WorkflowInstance>();

  return {
    createdBatchSizes,
    binding: {
      async get(id: string) {
        const instance = instances.get(id);

        if (!instance) {
          throw new Error(`Workflow instance ${id} was not found.`);
        }

        return instance;
      },
      async create(options?: { id?: string; params?: JobWorkflowParams }) {
        const id = options?.id ?? crypto.randomUUID();
        const instance = createWorkflowInstance(id, {});
        instances.set(id, instance);
        return instance;
      },
      async createBatch(batch: { id?: string; params?: JobWorkflowParams }[]) {
        createdBatchSizes.push(batch.length);

        return await Promise.all(
          batch.map(async (item) => {
            const jobId = item.params?.jobId;

            if (!jobId) {
              throw new Error('jobId is required.');
            }

            if (options.worker?.(jobId) === 'ABORTED') {
              await testDb
                .update(jobs)
                .set({ status: 'ABORTED', resultError: 'planned failure' })
                .where(eq(jobs.id, jobId));
            } else if (
              !options.completeOnSecondStatus &&
              !options.keepJobRunning
            ) {
              await testDb
                .update(jobs)
                .set({ status: 'FINISHED', crawledAt: 'now' })
                .where(eq(jobs.id, jobId));
            }

            const instance = createWorkflowInstance(jobId, options);
            instances.set(jobId, instance);
            return instance;
          }),
        );
      },
    },
  };
}

function createWorkflowInstance(
  id: string,
  options: JobWorkflowOptions,
): WorkflowInstance {
  let statusCalls = 0;

  return {
    id,
    async pause() {},
    async resume() {},
    async terminate() {},
    async restart() {},
    async sendEvent() {},
    async status() {
      statusCalls += 1;

      if (options.status) {
        const status = {
          status: options.status,
        };

        if (options.errorMessage) {
          return {
            ...status,
            error: { name: 'Error', message: options.errorMessage },
          };
        }

        return status;
      }

      if (options.completeOnSecondStatus && statusCalls === 1) {
        await testDb
          .update(jobs)
          .set({ status: 'FINISHED', crawledAt: 'now' })
          .where(eq(jobs.id, id));

        return { status: 'running' };
      }

      return { status: 'complete' };
    },
  };
}

async function seedInitialJob(meta?: Record<string, unknown>) {
  const service = createOrchestratorService();
  const initialized = await service.initialize({}, () => ({
    execute: createExecute(),
    jobs: createJobs([
      meta
        ? { url: 'https://example.com/', kind: 'LIST', meta }
        : { url: 'https://example.com/', kind: 'LIST' },
    ]),
  }));
  const [job] = await fetchJobs(initialized.execute.id);

  if (!job) {
    throw new Error('Seeded job was not found.');
  }

  return {
    executeId: initialized.execute.id,
    jobId: job.id,
  };
}

async function insertInitialJob(
  url: string,
  id = crypto.randomUUID(),
  executeId?: string,
) {
  if (executeId) {
    await testDb.insert(jobs).values({
      id,
      executeId,
      kind: 'LIST',
      status: 'WAITING',
      url,
      meta: '{}',
      resultCount: 0,
    });

    return executeId;
  }

  const initialized = await createOrchestratorService().initialize({}, () => ({
    execute: createExecute(),
    jobs: createJobs([{ url, kind: 'LIST' }]).map((job) => ({ ...job, id })),
  }));

  return initialized.execute.id;
}

async function findJobByUrl(executeId: string, url: string) {
  const [job] = await testDb
    .select()
    .from(jobs)
    .where(and(eq(jobs.executeId, executeId), eq(jobs.url, url)));

  if (!job || job.url !== url) {
    throw new Error(`Job ${url} was not found.`);
  }

  return job;
}

async function countRows(table: 'executes' | 'jobs' | 'records') {
  const source =
    table === 'executes' ? executes : table === 'jobs' ? jobs : records;
  const [row] = await testDb.select({ value: count() }).from(source);

  return row?.value ?? 0;
}
