# mercari-crawler

デュエルマスターズ メルカリ価格リサーチのメルカリクローラーです。
30分ごとに有効なSearchConditionのメルカリ検索結果1ページ目をクロールし、出品価格の中央値と検索結果のScreenshotを保存します。

設計の背景は `docs/designs/duel-masters-mercari-price-research-decisions.md` を参照してください。

## 役割

- `src/index.ts` は entrypoint
- `src/index.ts` からWorkflowのcrawlerクラスを直接exportする
- `src/crawler/MercariCrawlerOrchestrator.ts` に起点Job生成、`MercariCrawlerJob.ts`にページ取得を置く
- `src/crawler/crawlResultRepository.ts` にクロール結果の読込・表示用DBへの保存、`priceAggregation.ts`に価格集計を置く
- `src/lib` に表示用DBのスキーマ定義を置く
- DB は2つ持つ
  - `DB`: このクローラー自身のjobs/executes/records(`packages/cf-crawler-core`のスキーマを使用)
  - `DISPLAY_DB`: 公式サイトクローラー・バックエンドと共有する表示用DB(決定事項8・決定事項20)
- Browser Renderingでメルカリの検索結果を表示する
- R2の`SCREENSHOTS`に検索結果1ページ目の全体Screenshotを保存する

## 固定ルール

- D1 binding名は`DB`(クローラー自身のDB)・`DISPLAY_DB`(表示用DB、共有)
- Workflow binding名は`ORCHESTRATOR`と`JOB_WORKFLOW`
- Browser Rendering binding名は`BROWSER`
- R2 binding名は`SCREENSHOTS`、bucket名は`mercari-crawler-screenshots`
- `job.kind`はcrawlerの処理段階を表す
- 未対応の`kind`はthrowする
- 手動実行用HTTPエンドポイントは持たず、Cron Triggerから起動する
- 検索結果は最新出品を確認する目的で1ページ目だけを対象とする
- 検索結果の表示完了は商品リンクまたは0件表示を待って判定し、`networkidle`には依存しない
- 表示用DBへ保存するのは正常終了した起点LISTジョブの結果だけとする
- ScreenshotのR2キーは`screenshots/{search_condition_id}/{LISTジョブID}.png`
- 同じ検索URLが複数のSearchConditionに含まれてもJobを失わないよう、Job URLのフラグメントへSearchCondition IDを付与する(`scopeJobUrl`)
- 検索結果は仮想化リスト・無限スクロール(IntersectionObserver)のため、出品件数が増えなくなるまでスクロールしてから一覧DOMを評価する
- 出品ごとの`title`/`price`は一覧DOMから直接抽出する。仮想化リストによりビューポート近傍の出品しかDOM上に存在せず、詳細ページへ遷移して読み直すことができないため

## マイグレーション

`DB`と`DISPLAY_DB`はスキーマ・マイグレーション出力先が別なので、drizzle configを分けている。

```bash
# クローラー自身のDB(jobs/executes/records)
pnpm run db:generate
pnpm run db:migrate

# 表示用DB(products/cards/search_conditions/price_points/screenshots/users/watches)
pnpm run display-db:generate
pnpm run display-db:migrate
```

## 実行方法

```bash
pnpm run cf-typegen
pnpm run db:migrate
pnpm run display-db:migrate
pnpm run dev
```

R2バケット作成後の初回セットアップとして、次を1回だけ実行します。

```bash
pnpm run screenshots:lifecycle:add
```

このコマンドはR2の`screenshots/`プレフィックスへ、アップロードから3日後に削除するライフサイクルルールを追加します。期限を迎えたオブジェクトの実削除には通常24時間程度の遅延があります。

ローカルでCron Triggerを実行する場合は`wrangler dev --test-scheduled`で起動し、`/cdn-cgi/handler/scheduled`へリクエストします。Browser RenderingをCloudflare上で動かす場合は、必要に応じて`browser.remote`をローカル用設定へ追加します。

## 参考

- 決定事項: `docs/designs/duel-masters-mercari-price-research-decisions.md`
- 要件定義: `docs/designs/requirements.md`
- core実装: `packages/cf-crawler-core`
