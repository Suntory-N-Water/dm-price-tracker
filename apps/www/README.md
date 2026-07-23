# dm-price-tracker API

Next.js App Router のキャッチオール Route Handler に Hono をマウントした
バックエンドです。画面機能は含みません。Cloudflare Workers への変換と
デプロイには OpenNext.js for Cloudflare を使います。

## ローカル設定

`apps/www/.dev.vars` に次の値を設定します。

```dotenv
TEAM_DOMAIN=https://<team-name>.cloudflareaccess.com
POLICY_AUD=<利用者向けAccessアプリケーションのAUD>
ADMIN_POLICY_AUD=<管理者向けAccessアプリケーションのAUD>
ADMIN_EMAIL=<管理者のメールアドレス>
```

表示用DBのマイグレーションは `mercari-crawler` が所有します。

```bash
pnpm --filter mercari-crawler run display-db:migrate
pnpm --filter www run dev
```

Hono アプリだけの疎通確認は、D1を必要としないヘルスチェックで行えます。

```bash
hono request src/api/app.ts -P /api/health
```

## API

すべての保護対象APIは `Cf-Access-Jwt-Assertion` を検証します。
`/api/admin/*` は管理者用AUDと `ADMIN_EMAIL` の両方を確認します。

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/api/health` | ヘルスチェック |
| GET | `/api/products` | カード絞り込み用の商品検索 |
| GET | `/api/cards` | カード名・商品によるカード検索 |
| GET | `/api/cards/:cardId/image` | Card画像のR2配信 |
| GET | `/api/card-watches` | 本人が価格チェック中のカード一覧 |
| POST | `/api/card-watches` | 価格チェック開始 |
| PUT | `/api/card-watches/:cardId` | 追加ワード・Card別除外ワード変更 |
| DELETE | `/api/card-watches/:cardId` | 価格チェック停止 |
| POST | `/api/card-watches/bulk-exclude-keyword` | 選択Cardへの除外ワード一括追加 |
| GET | `/api/card-watches/:cardId/price-history` | 本人の価格履歴 |
| GET | `/api/card-watches/:cardId/screenshots/:crawledAt` | 対応する検索結果画像 |
| GET | `/api/settings/common-exclude-keywords` | 共通除外ワード取得 |
| PUT | `/api/settings/common-exclude-keywords` | 共通除外ワード変更・全Card同期 |
| GET | `/api/admin/products` | 取得開始済み商品と状態の一覧 |
| GET | `/api/admin/products/available` | 未取得商品の検索 |
| POST | `/api/admin/products/sync` | 公式商品一覧の手動同期 |
| POST | `/api/admin/products/:productCode/crawl` | 商品単位のCard取得開始 |

## 検証とデプロイ

```bash
pnpm --filter www run test
pnpm --filter www run type-check
pnpm --filter www run build
pnpm --filter www run preview
pnpm --filter www run deploy
```

Screenshotの3日保持は、R2 Lifecycle Ruleを一度設定します。

```bash
pnpm --filter mercari-crawler run screenshots:lifecycle:add
```
