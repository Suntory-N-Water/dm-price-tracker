export type CrawlerEventType =
  | 'crawl-mercari'
  | 'crawl-official-products'
  | 'crawl-official-card-ids'
  | 'crawl-official-card-details';

export async function dispatchCrawlerWorkflow({
  repository,
  token,
  eventType,
  crawlRunId,
}: {
  repository: string;
  token: string;
  eventType: CrawlerEventType;
  crawlRunId: string;
}): Promise<void> {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'dm-price-tracker',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: { crawlRunId },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub Actionsの起動に失敗しました: ${response.status}`);
  }
}
