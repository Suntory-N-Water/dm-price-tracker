# @dm-price-tracker/api

Cloudflare Workers 上で動く独立 Hono API です。`/api/health` を除く利用者
APIは Cloudflare Access JWT、`/api/admin/*` は管理者 AUD とメールアドレス、
`/api/crawler/*` は専用 Bearer token で認証します。

## ローカル開発と検証

```bash
pnpm --filter @dm-price-tracker/api run dev
pnpm --filter @dm-price-tracker/api run test
pnpm --filter @dm-price-tracker/api run type-check
pnpm --filter @dm-price-tracker/api run build
pnpm --filter @dm-price-tracker/api exec hono request src/app.ts -P /api/health
```

`dev` は `WEB_ORIGIN=http://localhost:3000` とローカル管理者 binding を渡します。
生成済み bindings 型は Wrangler 設定変更後に更新してください。

```bash
pnpm --filter @dm-price-tracker/api run cf-typegen
```

## Cloudflare 設定

`wrangler.jsonc` は D1 `DISPLAY_DB`、R2 `CARD_IMAGES`・`SCREENSHOTS`、
30分 Cron、observability を定義します。本番前に
`WEB_ORIGIN=https://web.example.com` を実在する Web origin へ置換し、次の
Secret を設定します。

```bash
pnpm --filter @dm-price-tracker/api exec wrangler secret put TEAM_DOMAIN
pnpm --filter @dm-price-tracker/api exec wrangler secret put POLICY_AUD
pnpm --filter @dm-price-tracker/api exec wrangler secret put ADMIN_POLICY_AUD
pnpm --filter @dm-price-tracker/api exec wrangler secret put ADMIN_EMAIL
pnpm --filter @dm-price-tracker/api exec wrangler secret put CRAWLER_API_KEY
pnpm --filter @dm-price-tracker/api exec wrangler secret put GITHUB_DISPATCH_TOKEN
```

Screenshot の3日保持は一度だけ設定します。

```bash
pnpm --filter @dm-price-tracker/api run r2:lifecycle:screenshots
```

デプロイは `pnpm deploy:api` です。新 Worker だけに Cron を有効化し、旧
Worker と同時実行しないでください。
