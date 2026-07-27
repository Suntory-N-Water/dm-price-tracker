# DM Price Tracker

デュエル・マスターズのカード価格を収集・確認する monorepo です。

- `apps/web`: TanStack Router と TanStack Query を使うクライアント SPA
- `apps/api`: D1・R2・Cron を所有する Hono Cloudflare Worker
- `apps/crawler`: GitHub Actions から実行する Node.js クローラー
- `packages/display-db`: Drizzle schema と D1 migration

Web と API は別 Worker・別 origin で公開します。旧 Next.js Worker との
並行稼働、proxy、fallback はありません。

## ローカル開発

Node.js 24 と pnpm を用意し、依存関係をインストールします。

```bash
pnpm install
pnpm dev
```

`pnpm dev` は D1 migration 後に次を起動します。

- Web: `http://localhost:3000`
- API: `http://localhost:8787`
- crawler: TypeScript watch

個別起動は `pnpm dev:web` と `pnpm dev:api` を使います。API のローカル
認証は `LOCAL_AUTH_EMAIL=developer@example.com`、
`LOCAL_AUTH_IS_ADMIN=true` の binding を起動 script が渡します。

## 検証

```bash
pnpm --filter @dm-price-tracker/api run test
pnpm --filter @dm-price-tracker/api run type-check
pnpm --filter @dm-price-tracker/api run build
pnpm --filter @dm-price-tracker/web run test
pnpm --filter @dm-price-tracker/web run type-check
pnpm --filter @dm-price-tracker/web run build
pnpm run ai-check
```

詳細は [API README](apps/api/README.md) と
[Web README](apps/web/README.md) を参照してください。
