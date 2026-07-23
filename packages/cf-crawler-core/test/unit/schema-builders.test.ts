import { describe, expect, it } from 'vitest';
import {
  createExecute,
  createJobs,
  createRecords,
  executes,
  jobs,
  records,
} from '../../src/index';

describe('Execute生成', () => {
  describe('正常系', () => {
    it('新しい実行を生成する時、未開始の実行として扱える初期値であること', () => {
      // Arrange
      const sut = createExecute;

      // Act
      const result = sut();

      // Assert
      expect(result.id).toEqual(expect.any(String));
      expect(result.status).toBe('WAITING');
      expect(result.startedAt).toBeNull();
    });
  });
});

describe('Job生成', () => {
  describe('正常系', () => {
    it('URLとkindだけを渡す時、起点Jobとして扱える初期値であること', () => {
      // Arrange
      const sut = createJobs;

      // Act
      const result = firstOf(
        sut([{ url: 'https://example.com/', kind: 'LIST' }]),
      );

      // Assert
      expect(result).toMatchObject({
        kind: 'LIST',
        status: 'WAITING',
        url: 'https://example.com/',
        meta: '{}',
        resultCount: 0,
      });
      expect(result.id).toEqual(expect.any(String));
    });

    it('metaを渡す時、呼び出し側が指定したmetaがJobに保持されること', () => {
      // Arrange
      const sut = createJobs;

      // Act
      const result = firstOf(
        sut([
          {
            url: 'https://example.com/',
            kind: 'LIST',
            meta: { girlId: '47977232' },
          },
        ]),
      );

      // Assert
      expect(result.meta).toBe('{"girlId":"47977232"}');
    });

    it('複数のJobを渡す時、入力した件数と同じ件数のJobが生成されること', () => {
      // Arrange
      const sut = createJobs;

      // Act
      const result = sut([
        { url: 'https://example.com/1', kind: 'LIST' },
        { url: 'https://example.com/2', kind: 'DETAIL' },
      ]);

      // Assert
      expect(result).toHaveLength(2);
    });
  });
});

describe('Record生成', () => {
  describe('正常系', () => {
    it('URLとdataを渡す時、クロール結果として扱える初期値であること', () => {
      // Arrange
      const sut = createRecords;

      // Act
      const result = firstOf(
        sut([{ url: 'https://example.com/', data: { title: 'Example' } }]),
      );

      // Assert
      expect(result).toMatchObject({
        url: 'https://example.com/',
        meta: '{}',
        data: '{"title":"Example"}',
      });
      expect(result.id).toEqual(expect.any(String));
    });

    it('metaを渡す時、呼び出し側が指定したmetaがRecordに保持されること', () => {
      // Arrange
      const sut = createRecords;

      // Act
      const result = firstOf(
        sut([
          {
            url: 'https://example.com/',
            data: 'body',
            meta: { girlId: '47977232' },
          },
        ]),
      );

      // Assert
      expect(result.meta).toBe('{"girlId":"47977232"}');
    });

    it('複数のRecordを渡す時、入力した件数と同じ件数のRecordが生成されること', () => {
      // Arrange
      const sut = createRecords;

      // Act
      const result = sut([
        { url: 'https://example.com/1', data: 'one' },
        { url: 'https://example.com/2', data: 'two' },
      ]);

      // Assert
      expect(result).toHaveLength(2);
    });
  });
});

describe('metaの扱い', () => {
  describe('正常系', () => {
    it('metaが指定されない時、空の情報として保存できること', () => {
      // Arrange
      const sut = createJobs;

      // Act
      const result = firstOf(
        sut([{ url: 'https://example.com/', kind: 'LIST' }]),
      );

      // Assert
      expect(result.meta).toBe('{}');
    });

    it('metaに任意のJSON値を含む時、core側では内容を検証せず保持すること', () => {
      // Arrange
      const sut = createJobs;

      // Act
      const result = firstOf(
        sut([
          {
            url: 'https://example.com/',
            kind: 'LIST',
            meta: { nested: { enabled: true }, list: [1, 'two', null] },
          },
        ]),
      );

      // Assert
      expect(result.meta).toBe(
        '{"nested":{"enabled":true},"list":[1,"two",null]}',
      );
    });
  });
});

describe('公開API', () => {
  describe('正常系', () => {
    it('crawler側からcoreのschemaを参照する時、共通スキーマをimportできること', () => {
      // Arrange
      const sut = { executes, jobs, records };

      // Act
      const result = sut;

      // Assert
      expect(result.executes).toBe(executes);
      expect(result.jobs).toBe(jobs);
      expect(result.records).toBe(records);
    });
  });
});

function firstOf<T>(values: T[]): T {
  const [value] = values;

  if (!value) {
    throw new Error('Expected at least one generated value.');
  }

  return value;
}
