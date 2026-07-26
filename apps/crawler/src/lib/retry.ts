import pRetry from 'p-retry';
import { sendCrawlResult } from './crawler-api';

export async function runCrawlerTarget({
  targetId,
  label,
  operation,
}: {
  targetId: string;
  label: string;
  operation: () => Promise<unknown>;
}): Promise<boolean> {
  let data: unknown;
  try {
    data = await pRetry(operation, { retries: 2, minTimeout: 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '不明なエラー';
    console.error(`${label}の取得に失敗しました`, error);
    await sendCrawlResult({
      targetId,
      success: false,
      error: message,
    });
    return false;
  }

  await sendCrawlResult({
    targetId,
    success: true,
    data,
  });
  return true;
}
