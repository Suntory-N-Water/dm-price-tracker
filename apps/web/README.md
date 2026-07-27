# @dm-price-tracker/web

Vite、React、TanStack Router の file-based routing、TanStack Query を使う
クライアント SPA です。SSR、TanStack Start、Server Functions は使いません。
Cloudflare Workers Static Assets が `dist` を配信し、未知の asset path は
SPA entrypoint へ解決します。

## 環境変数

```bash
cp apps/web/.env.example apps/web/.env.local
```

`VITE_API_BASE_URL` は `/api` を含まない API origin です。

```dotenv
VITE_API_BASE_URL=http://localhost:8787
```

本番 build では `https://<api-host>` を設定してください。Hono RPC client は
すべての request に `credentials: include` を付けます。

## 開発・検証・デプロイ

```bash
pnpm --filter @dm-price-tracker/web run dev
pnpm --filter @dm-price-tracker/web run generate-routes
pnpm --filter @dm-price-tracker/web run test
pnpm --filter @dm-price-tracker/web run type-check
VITE_API_BASE_URL=https://<api-host> pnpm --filter @dm-price-tracker/web run build
pnpm deploy:web
```

`src/routeTree.gen.ts` は生成物なので手編集しません。TanStack Devtools は
開発時だけ有効で、production build から除去されます。
