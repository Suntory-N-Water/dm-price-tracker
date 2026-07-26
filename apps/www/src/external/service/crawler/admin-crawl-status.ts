export type CrawlStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIALLY_FAILED'
  | 'FAILED';

export type CrawlSummary = {
  status: CrawlStatus;
  updatedAt: string;
  error: string | null;
};

export async function findAdminCrawlerStatus(database: D1Database): Promise<{
  products: {
    code: string;
    name: string;
    cardIdCrawl: CrawlSummary;
    cardDetailsCrawl: CrawlSummary | null;
    pendingCardCount: number;
  }[];
  mercariCrawl: CrawlSummary | null;
  officialProductsCrawl: CrawlSummary | null;
}> {
  const products = await database
    .prepare(
      `WITH latest_runs AS (
         SELECT
           id,
           kind,
           product_code,
           status,
           updated_at,
           ROW_NUMBER() OVER (
             PARTITION BY kind, product_code
             ORDER BY created_at DESC
           ) AS position
         FROM crawl_runs
         WHERE kind IN ('OFFICIAL_CARD_IDS', 'OFFICIAL_CARD_DETAILS')
       )
       SELECT
         products.code,
         products.name,
         card_ids.status AS card_id_status,
         card_ids.updated_at AS card_id_updated_at,
         (
           SELECT error
           FROM crawl_targets
           WHERE crawl_run_id = card_ids.id AND error IS NOT NULL
           ORDER BY updated_at DESC
           LIMIT 1
         ) AS card_id_error,
         card_details.status AS card_details_status,
         card_details.updated_at AS card_details_updated_at,
         (
           SELECT error
           FROM crawl_targets
           WHERE crawl_run_id = card_details.id AND error IS NOT NULL
           ORDER BY updated_at DESC
           LIMIT 1
         ) AS card_details_error,
         (
           SELECT COUNT(*)
           FROM pending_cards
           WHERE product_id = products.code
         ) AS pending_card_count
       FROM products
       INNER JOIN latest_runs AS card_ids
         ON card_ids.product_code = products.code
        AND card_ids.kind = 'OFFICIAL_CARD_IDS'
        AND card_ids.position = 1
       LEFT JOIN latest_runs AS card_details
         ON card_details.product_code = products.code
        AND card_details.kind = 'OFFICIAL_CARD_DETAILS'
        AND card_details.position = 1
       ORDER BY products.display_order, products.code`,
    )
    .all<{
      code: string;
      name: string;
      card_id_status: CrawlStatus;
      card_id_updated_at: string;
      card_id_error: string | null;
      card_details_status: CrawlStatus | null;
      card_details_updated_at: string | null;
      card_details_error: string | null;
      pending_card_count: number;
    }>();
  const globalRuns = await database
    .prepare(
      `SELECT
         kind,
         status,
         updated_at,
         (
           SELECT error
           FROM crawl_targets
           WHERE crawl_run_id = crawl_runs.id AND error IS NOT NULL
           ORDER BY updated_at DESC
           LIMIT 1
         ) AS error
       FROM crawl_runs
       WHERE kind IN ('MERCARI', 'OFFICIAL_PRODUCTS')
         AND id = (
           SELECT latest.id
           FROM crawl_runs AS latest
           WHERE latest.kind = crawl_runs.kind
           ORDER BY latest.created_at DESC
           LIMIT 1
         )`,
    )
    .all<{
      kind: 'MERCARI' | 'OFFICIAL_PRODUCTS';
      status: CrawlStatus;
      updated_at: string;
      error: string | null;
    }>();
  const mercari = globalRuns.results.find(({ kind }) => kind === 'MERCARI');
  const officialProducts = globalRuns.results.find(
    ({ kind }) => kind === 'OFFICIAL_PRODUCTS',
  );

  return {
    products: products.results.map((product) => ({
      code: product.code,
      name: product.name,
      cardIdCrawl: {
        status: product.card_id_status,
        updatedAt: product.card_id_updated_at,
        error: product.card_id_error,
      },
      cardDetailsCrawl:
        product.card_details_status === null ||
        product.card_details_updated_at === null
          ? null
          : {
              status: product.card_details_status,
              updatedAt: product.card_details_updated_at,
              error: product.card_details_error,
            },
      pendingCardCount: product.pending_card_count,
    })),
    mercariCrawl:
      mercari === undefined
        ? null
        : {
            status: mercari.status,
            updatedAt: mercari.updated_at,
            error: mercari.error,
          },
    officialProductsCrawl:
      officialProducts === undefined
        ? null
        : {
            status: officialProducts.status,
            updatedAt: officialProducts.updated_at,
            error: officialProducts.error,
          },
  };
}
