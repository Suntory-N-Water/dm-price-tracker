# DM Price Tracker

Next.js App Router のキャッチオール Route Handler に Hono をマウントした
画面・API一体のアプリケーションです。Cloudflare Workers への変換と
デプロイには OpenNext.js for Cloudflare を使います。本番ではすべての
保護対象APIでCloudflare AccessのJWTを検証します。

## ローカル開発

追加設定なしで、開発用管理者 `developer@example.com` として起動します。
一般利用者として確認する場合やメールアドレスを変更する場合だけ、
開発用認証設定を作成します。

```bash
cp apps/www/.env.local.example apps/www/.env.local
```

`LOCAL_AUTH_IS_ADMIN=false` にすると一般利用者として確認できます。この認証は
`NODE_ENV=development` の時だけ有効で、本番のCloudflare Access認証には
影響しません。

リポジトリルートから次のコマンドを実行すると、3つのローカルD1へ
マイグレーションを適用した後、画面・メルカリクローラー・公式サイト
クローラーを並列起動します。D1とR2の状態はすべてルートの
`.wrangler/state/v3` を共有します。

```bash
pnpm dev
```

画面は `http://localhost:3000` で確認できます。個別に起動する場合は
次のルートコマンドを使用します。

```bash
pnpm dev:www
pnpm dev:mercari-crawler
pnpm dev:official-crawler
```

ローカルではCronが自動実行されないため、価格取得を開始する時は別の
ターミナルから実行します。

```bash
pnpm crawl:mercari
```

ローカルDBのマイグレーションだけを実行する場合:

```bash
pnpm db:migrate:local
```

Hono アプリだけの疎通確認は、`apps/www` で
`hono request src/api/app.ts -P /api/health` を実行します。

## 本番設定

デプロイ先には次のSecretを設定します。

```dotenv
TEAM_DOMAIN=https://<team-name>.cloudflareaccess.com
POLICY_AUD=<利用者向けAccessアプリケーションのAUD>
ADMIN_POLICY_AUD=<管理者向けAccessアプリケーションのAUD>
ADMIN_EMAIL=<管理者のメールアドレス>
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
