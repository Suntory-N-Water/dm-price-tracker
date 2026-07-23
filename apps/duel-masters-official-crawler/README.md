# duel-masters-official-crawler

指定した商品に属する未登録カードを、デュエル・マスターズ公式カードサイトから収集するWorker。

## 起動経路

バックエンドのService Bindingから`crawl(productCode)`を呼ぶ。商品コードは`26ex2`の形式で指定する。全商品を横断する起動経路は設けない。

```jsonc
{
  "services": [
    {
      "binding": "DUEL_MASTERS_CRAWLER",
      "service": "duel-masters-official-crawler"
    }
  ]
}
```

```ts
await env.DUEL_MASTERS_CRAWLER.crawl('26ex2');
```

## クロール処理

1. 公式サイトの商品選択肢から商品名を取得する。
2. 公式ページ自身が使う検索XHR（`POST /card/`）へ商品コードとページ番号を送信し、商品内の全カードIDを取得する。
3. `DISPLAY_DB.cards`に同じ商品で登録済みのIDを除外する。
4. 未登録IDだけ詳細ページを1秒以上の間隔で取得し、`h3.card-name`からカード名を取得する。
5. カード画像を`CARD_IMAGES` R2へ`cards/{card-id}.{拡張子}`で保存する。
6. 全Job完了後、ProductとCard（カード名・`image_key`）を共有`DISPLAY_DB`へ登録する。

`CHUNK_SIZE`は1に固定し、DETAIL Jobを直列実行する。

## Binding

- `DB`: クローラー基盤用D1
- `DISPLAY_DB`: `mercari-crawler`・バックエンドと共有する表示用D1
- `CARD_IMAGES`: カード画像用R2（bucket: `duelmasters-card-images`）
- `ORCHESTRATOR` / `JOB_WORKFLOW`: Workflows

表示用DBのDDLは`apps/mercari-crawler/migrations-display-db`を正とし、このアプリでは重複管理しない。

## ローカル実行

```bash
pnpm run db:migrate
pnpm exec wrangler d1 execute duelmasters-display-db \
  --local \
  --file ../mercari-crawler/migrations-display-db/0000_boring_venus.sql
pnpm run dev
```

## 検証

```bash
pnpm run type-check
pnpm exec wrangler deploy --dry-run
```

2026-07-22に実商品`spdeck13`でクロール処理を確認した。初回はLIST 1件、DETAIL 11件、Record・Card・R2画像を各11件保存した。再実行時はDETAILとRecordが0件になった。
