# Next.jsからTanStack Router・Honoへ分離する移行計画

- 作成日: 2026-07-26
- 状態: 実装待ち
- 対応範囲: 移行方針、移行順序、完了条件の決定まで。実装は行わない。

## 背景

現在の`apps/www`は、次の責務を1つのNext.jsアプリケーションとCloudflare
Workerへまとめている。

- Next.js App Routerによる画面表示
- React Server Componentsによる初期データ取得
- Server Actionsによるクライアントからの問い合わせと更新
- Next.js Route HandlerへマウントしたHono API
- D1・R2を使用するリポジトリとサービス
- 30分ごとのCron Trigger

一方、移行先として次の初期セットアップだけが既に作成されている。

- `apps/web`: Vite、React、TanStack RouterのSPA
- `apps/api`: Cloudflare Workers上で動くHonoアプリケーション

画面とAPIの実行単位、デプロイ先、公開URLを分離し、Next.jsと
OpenNext.js for Cloudflareを廃止する。

本システムは開発中であるため、旧方式との後方互換性、段階移行、
並行稼働、二重書き込みは行わない。切替時の停止を許容し、新方式へ
一括で置き換える。

## 現状調査

### 画面

現行画面は次のURLを持つ。

| URL | 役割 |
| --- | --- |
| `/` | `/watches`へ転送 |
| `/watches` | 価格チェック中のカード一覧 |
| `/watches/:cardId` | カードの価格履歴 |
| `/cards` | カード検索と価格チェック開始・解除 |
| `/settings/common-exclude-keywords` | 共通除外ワード設定 |
| `/admin` | `/admin/products`へ転送 |
| `/admin/products` | 商品とクローラー状態の管理 |

ページの初期データはServer Componentで取得し、TanStack Queryへ
hydrateしている。画面表示後の再取得と更新はServer Actionsを経由している。
検索、絞り込み、ページ番号、価格履歴の期間はURLへ保存せず、各画面の
ローカルstateで管理している。

### API

Honoアプリケーション本体は`apps/www/src/api`にあり、
`/api`をbase pathとしている。Next.jsのキャッチオールRoute Handlerは、
受け取ったRequestとCloudflare bindingsをHonoの`app.fetch()`へ渡している。

APIの実装は次のものへ依存している。

- `apps/www/src/external/repository`: D1アクセス
- `apps/www/src/external/service`: 価格集計、検索条件、設定、R2レスポンス、
  クローラー実行管理
- `apps/www/src/external/client`: GitHub Repository Dispatch
- `packages/display-db`: Drizzle schemaとDB生成
- D1 binding `DISPLAY_DB`
- R2 bindings `CARD_IMAGES`、`SCREENSHOTS`
- Cloudflare Access、クローラー、GitHub用の環境変数とSecret

Cron Triggerと`scheduled()`ハンドラーも`apps/www`が所有している。

### 認証

- `/api/health`は認証しない。
- `/api/crawler/*`は専用Bearer tokenで認証する。
- その他のAPIはCloudflare Accessが付与する
  `Cf-Access-Jwt-Assertion`をHonoで再検証する。
- `/api/admin/*`は管理者用AUDと`ADMIN_EMAIL`を追加で確認する。
- ローカル開発時だけ、固定ユーザーとして認証する。

### 初期セットアップで整理が必要な点

- `apps/web`には`main.tsx`と`router.tsx`でRouter生成処理が重複している。
- `apps/web/README.md`はTanStack Startの説明を含むが、実体は
  TanStack Routerを使うクライアントSPAである。
- `apps/web`配下に独立した`pnpm-lock.yaml`、`pnpm-workspace.yaml`、
  `apps/api/README.md`がある。ルートworkspaceへ統合するため不要である。
- `apps/api`のWrangler設定、bindings、テスト、型生成、Cronは未設定である。
- ルートスクリプト、DB migration、CI、READMEは`apps/www`を参照している。

## 決定事項

### 実行・公開構成

`apps/web`と`apps/api`は、別々のCloudflare Worker、別々の公開URLとして
デプロイする。

```text
Browser
  ├─ https://<web-host>       -> apps/web（静的SPA）
  └─ https://<api-host>/api/* -> apps/api（Hono Worker）

GitHub Actions
  └─ https://<api-host>/api/crawler/*
```

- WebからAPIへの通信はブラウザのcross-origin fetchで直接行う。
- Web WorkerからAPI Workerへのproxy、Service Binding、BFFは追加しない。
- APIのパスは既存どおり`/api/*`とする。URLのhostだけを分離する。
- APIのrequest・responseと永続化の挙動は、分離に不要な変更を加えない。
- Webはクライアントレンダリングのみとし、SSR、TanStack Start、
  React Server Components、Server Functionsは採用しない。
- Web WorkerはCloudflare Workers Static Assetsで`dist`を配信し、
  `assets.not_found_handling`を`single-page-application`にする。
- `apps/www`、Next.js、OpenNext.js for Cloudflareは移行完了時に削除する。

### Cloudflare AccessとCORS

WebとAPIでURLが分かれるため、Cloudflare Accessのapplication cookieと
CORSを明示的に設定する。

#### Access application

- 一般利用者用Access applicationへ、実在する`<web-host>`と`<api-host>`を
  両方登録する。
- 管理者用Access applicationへ、Webの`/admin/*`とAPIの
  `/api/admin/*`を登録する。
- wildcard hostではなく具体的な2つのhostを登録し、ログイン時に両方の
  application cookieが発行される構成にする。
- cross-origin requestへcookieを送れるよう、Accessのapplication cookieは
  `SameSite=None; Secure`とする。
- Hono側のJWT再検証は残し、一般APIでは`POLICY_AUD`、管理APIでは
  `ADMIN_POLICY_AUD`を検証する。
- `/api/health`はAccessを要求しない。
- `/api/crawler/*`は利用者用Accessの対象外とし、既存のBearer認証だけを
  適用する。

#### CORS

- HonoのCORS middlewareをroute登録より前に置く。
- `Access-Control-Allow-Origin`は`WEB_ORIGIN`と完全一致させ、`*`を使わない。
- `Access-Control-Allow-Credentials: true`を返す。
- 許可methodは`GET`、`HEAD`、`POST`、`PUT`、`DELETE`、`OPTIONS`に限定する。
- 許可request headerは実際に使用する`Content-Type`に限定する。
- WebのHono clientはすべてのrequestで`credentials: 'include'`を使う。
- AccessのCORS設定でOPTIONSをoriginへ通し、preflight responseはHonoへ
  一元化する。
- 利用者・管理者向けのunsafe methodにはHonoのCSRF middlewareを適用し、
  許可originを`WEB_ORIGIN`に限定する。クローラーAPIは対象外とする。

Access cookieがない状態でcross-origin fetchを開始すると、ブラウザ内の
fetchだけではAccessのログインを完了できない。複数ドメインを同じAccess
applicationへ登録してAPI側のcookieを事前発行することを、本番切替の
必須条件とする。認証切れやAccessのHTML応答をAPI clientで通常のJSON
エラーとして扱わず、「セッションが切れました。再読み込みしてください」
と表示し、Webの再読み込みでAccess認証をやり直す。

### Hono APIの構成

現行のAPI、repository、service、GitHub client、Cronを`apps/api`へ
まとめて移す。移行だけを目的とするため、同時にcontroller層などの
新しい抽象化は追加しない。

想定構成:

```text
apps/api/
  src/
    index.ts
    app.ts
    middleware/
      authentication.ts
    routes/
      admin-products.ts
      card-watches.ts
      cards.ts
      crawler.ts
      products.ts
      settings.ts
    external/
      client/
      repository/
      service/
    test-utils/
```

- `app.ts`はテスト可能な`createApp()`、本番用`app`、RPC用`AppType`をexportする。
- routeは現行どおり機能単位に分け、`app.route()`をchainして
  `AppType`の推論を維持する。
- `index.ts`は`fetch`にHono appを渡し、`scheduled`で既存の
  `runScheduledCrawl()`を実行する。
- `CloudflareEnv`相当の型は`apps/api/wrangler.jsonc`から生成する。
- `DISPLAY_DB`、`CARD_IMAGES`、`SCREENSHOTS`、Cron Trigger、observabilityを
  `apps/api/wrangler.jsonc`へ移す。
- `TEAM_DOMAIN`、`POLICY_AUD`、`ADMIN_POLICY_AUD`、`ADMIN_EMAIL`、
  `CRAWLER_API_KEY`、`GITHUB_DISPATCH_TOKEN`をAPI WorkerのSecretへ移す。
- `GITHUB_REPOSITORY`と`WEB_ORIGIN`をAPI Workerのvarsへ設定する。
- ローカル認証は`NODE_ENV`に依存させず、Wranglerのローカルbindingで
  `LOCAL_AUTH_EMAIL`と`LOCAL_AUTH_IS_ADMIN`が指定された場合だけ有効にする。
- ログとエラーメッセージは引き続き日本語にする。

### WebとAPIの型境界

WebからのAPI呼び出しにはHono RPC clientを使う。

- `apps/api`のpackage名を`@dm-price-tracker/api`とし、
  `AppType`を型として公開する。
- `apps/web`は`AppType`をtype-only importし、
  `hc<AppType>(VITE_API_BASE_URL, { init: { credentials: 'include' } })`で
  clientを1つ生成する。
- URL、query、param、JSON body、成功responseの型はHonoのroute定義から
  推論する。
- APIで`response.ok`がfalseの場合は、共通の`ApiError`へ変換する。
  この処理はすべてのquery・mutationから呼ばれるため、共通化する。
- APIのresponse型だけを共有する新規packageは作成しない。
- 現在の`api-schemas.ts`にあるクライアントフォーム用Valibot schemaは、
  使用するWeb featureへ移す。サーバー側の入力検証はHono routeで必ず行う。
- Hono RPCはコンパイル時の契約であり、AccessのHTML応答や未知のエラー本文を
  保証しない。共通error処理ではContent-Typeを確認してから本文を読む。

### TanStack Routerの構成

既に導入済みのfile-based routingとautomatic code splittingを使う。
route構成は次のようにする。

```text
apps/web/src/routes/
  __root.tsx
  index.tsx
  _user.tsx
  _user/
    watches/
      index.tsx
      $cardId.tsx
    cards.tsx
    settings/
      common-exclude-keywords.tsx
  admin.tsx
  admin/
    index.tsx
    products.tsx
```

- `__root.tsx`はQueryClientProvider、共通head、root error、
  not-found UIを所有する。
- `_user.tsx`はURL segmentを増やさないpathless layoutとし、
  利用者向けsidebarと共通pending・error UIを持つ。
- `admin.tsx`は管理者向けsidebarと共通pending・error UIを持つ。
- `/`と`/admin`はTanStack Routerの`redirect()`で既存の遷移先へ転送する。
- `/watches/$cardId`はTanStack Routerのpath paramを使い、手作業の
  `encodeURIComponent()`でroute文字列を組み立てない。
- Next.jsの`Link`はTanStack Routerの`Link`へ置き換え、active状態は
  Routerのactive propsで表現する。
- Next.jsの`Image`は通常の`img`へ置き換える。現行は全画像で
  `unoptimized`を指定しているため、画像最適化serverは代替しない。
- `next/font`は廃止し、Noto Sans JPをWeb bundleから配信する。
- ページtitleとdescriptionはrouteのhead設定へ移す。
- 現在の検索、絞り込み、ページ番号、価格期間のローカルstateは維持し、
  この移行ではsearch params化しない。

### TanStack Queryとroute loader

画面表示後の再取得、mutation、cache invalidationが必要なため、
TanStack Queryは残す。

- Router生成時にQueryClientを1回作成し、Router contextと
  QueryClientProviderの両方へ同じinstanceを渡す。
- query optionをfeature単位で定義し、route loaderは
  `context.queryClient.ensureQueryData()`で必要データを揃える。
- 複数APIが必要な画面ではloader内で`Promise.all()`を使う。
- route componentとcontainerは同じquery optionを
  `useSuspenseQuery()`で購読する。
- 現行のServer Component、`HydrationBoundary`、`dehydrate()`、
  `initialData` propsは削除する。
- mutation成功時のquery key invalidationは現行挙動を維持する。
- loader中のAPI errorはrouteの`errorComponent`へ渡す。
- 価格履歴APIの404は`notFound()`へ変換し、それ以外の失敗と区別する。
- 管理画面の初期loaderで401・403を受けた場合は`/watches`へ転送する。
- loader errorの再試行はQuery error boundaryをresetしたうえで
  `router.invalidate()`を使う。

### UIコードの移動

次のものは`apps/web/src`へ移し、Next.js固有部分だけを置き換える。

- `features/*/components/client`
- `features/*/queries`
- `shared/components/ui`
- `shared/components/layout`
- `shared/lib`
- `globals.css`

`components/server`、`external/handler/*.server.ts`、
`external/handler/*.action.ts`、`QueryProvider.tsx`は役割ごと削除し、
route loader、Hono client、Router初期化へ置き換える。

### 初期セットアップの整理

- Router生成処理は`router.tsx`へ集約し、`main.tsx`はそれを使用する。
- 生成物`routeTree.gen.ts`は手編集しない。
- `apps/web`配下のlockfileとworkspace定義を削除し、ルートworkspaceだけを使う。
- 誤って作られた`apps/web/apps/api/README.md`を削除する。
- `apps/web/README.md`を実際のSPA構成、ローカル起動、環境変数、
  検証、デプロイ方法に書き換える。
- `latest`指定はやめ、ルートlockfileで解決したversionを明示する。
- TypeScriptはルートのcatalogへ揃える。初期セットアップだけが要求する
  TypeScript 6は使わない。
- TanStack Devtoolsはdevelopment buildだけで有効にする。

## 環境変数・外部設定の変更

| 設定先 | キー | 値・用途 |
| --- | --- | --- |
| Web build | `VITE_API_BASE_URL` | `https://<api-host>` |
| API vars | `WEB_ORIGIN` | `https://<web-host>` |
| API vars | `GITHUB_REPOSITORY` | Repository Dispatch対象 |
| API secrets | `TEAM_DOMAIN` | Access issuer |
| API secrets | `POLICY_AUD` | 一般利用者APIのAccess AUD |
| API secrets | `ADMIN_POLICY_AUD` | 管理APIのAccess AUD |
| API secrets | `ADMIN_EMAIL` | 管理者メールアドレス |
| API secrets | `CRAWLER_API_KEY` | GitHub ActionsとのBearer token |
| API secrets | `GITHUB_DISPATCH_TOKEN` | Repository Dispatch用token |
| GitHub Actions variable | `CRAWLER_API_BASE_URL` | `https://<api-host>` |
| Local Web | `VITE_API_BASE_URL` | `http://localhost:8787` |
| Local API | `WEB_ORIGIN` | `http://localhost:3000` |
| Local API | `LOCAL_AUTH_EMAIL` | 開発ユーザー |
| Local API | `LOCAL_AUTH_IS_ADMIN` | 開発ユーザーの管理権限 |

`VITE_API_BASE_URL`には`/api`を含めず、Honoの型付きclientがroute pathとして
`/api/*`を付ける。末尾slashの扱いはclient生成箇所で統一する。

## 移行手順

以下は実装上の依存順であり、本番へ段階的に公開する手順ではない。
すべてを1つの移行として完成させてから切り替える。

### 1. 初期セットアップをルートworkspaceへ統合する

1. `apps/api`と`apps/web`のpackage名、version、scripts、TypeScript設定を
   monorepo規約へ揃える。
2. `apps/web`配下の不要なworkspace、lockfile、誤配置ファイルを削除する。
3. ルートlockfileを更新する。
4. APIとWebに`type-check`、`test`、`build`を用意する。

### 2. Hono APIを`apps/api`へ移す

1. Hono app、middleware、routesを移す。
2. repository、service、GitHub client、API専用schemaを移す。
3. D1、R2、Secret、vars、observabilityをWrangler設定へ移す。
4. Cronと`scheduled()`ハンドラーを移す。
5. CORS、CSRF、body limit、認証、not-found、error handlerの順序を確定する。
6. `AppType`を公開し、Hono RPCでroute型を取得できる状態にする。
7. API testとCloudflare test設定を移す。
8. `packages/display-db`のmigration参照先を`apps/api/wrangler.jsonc`へ変える。

### 3. WebのAPI clientとデータ取得を置き換える

1. Hono RPC clientと共通error処理を作る。
2. 既存のquery keyを使ってquery optionとmutationを作る。
3. Server Actionsと内部`app.fetch()`への依存をすべてcross-origin APIへ
   置き換える。
4. AccessのHTML応答、401、403、404、一般API errorを区別する。

### 4. 画面をTanStack Routerへ移す

1. root、利用者layout、管理者layout、redirect routeを作る。
2. `/watches`、`/cards`、設定、価格履歴、管理画面の順にrouteを作る。
3. 各routeへloader、pending、error、not-found、headを割り当てる。
4. PresenterとUI componentを移す。
5. Next.jsのLink、Image、font、metadata、Server Component指定を除去する。
6. route treeを再生成し、生成元routeとの整合を確認する。

### 5. テストを移し、境界のテストを追加する

API側:

- 現行の認証、cards、card-watches、settings、admin-products、crawler、
  image、price-history、scheduled testを`apps/api`へ移す。
- D1・R2を使うCloudflare Vitest設定を`apps/api`へ移す。
- CORS preflightで許可origin、credentials、methods、headersを確認する。
- 許可外originとCSRF対象requestが拒否されることを確認する。
- `app.request()`と`hono request`で`/api/health`を確認する。

Web側:

- 現行Presenter testを`apps/web`へ移す。
- Next.js componentのmockを削除し、TanStack Routerを含むtest wrapperへ変える。
- route redirect、価格履歴404、管理APIの401・403、loader error再試行を確認する。
- Hono clientが`credentials: 'include'`を使い、非JSONのAccess応答を
  認証切れとして扱うことを確認する。
- mutation後のquery invalidationを確認する。

### 6. リポジトリ全体の参照を更新する

1. ルートの`dev`を`api`、`web`、`crawler`の並列起動へ変える。
2. `dev:www`、`deploy:www`を廃止し、`dev:web`、`dev:api`、
   `deploy:web`、`deploy:api`へ置き換える。
3. DB migration、R2 lifecycle、型生成のconfig参照を`apps/api`へ変える。
4. ルートREADME、API README、Web READMEを更新する。
5. `docs/designs/crawler-github-actions-migration.md`に残る
   `apps/www`の所有記述を`apps/api`へ更新する。
6. CIがAPI test、Web test、全packageのtype-checkとbuildを実行するようにする。
7. 全リポジトリから`apps/www`、Next.js、OpenNext参照が消えたことを検索する。

### 7. `apps/www`を削除する

API、画面、test、設定、ドキュメントの移動完了後に、`apps/www`を
ディレクトリごと削除する。互換adapter、転送用Route Handler、
旧URLから新URLへのredirect Workerは残さない。

## 本番切替

旧Workerと新WorkerのCronを同時に動かさない。短時間の停止を許容し、
次の順で一括切替する。

1. Web hostとAPI hostのDNS、Custom Domain、Access application、
   API側CORS設定を事前に作成する。
2. 旧`apps/www` WorkerのCron Triggerを停止し、旧公開URLへのtrafficを止める。
3. API WorkerへD1・R2 bindings、vars、Secretを設定してデプロイする。
4. `GET https://<api-host>/api/health`、利用者API、管理API、
   crawler Bearer APIを確認する。
5. GitHub Actionsの`CRAWLER_API_BASE_URL`を新しいAPI hostへ変更する。
6. `VITE_API_BASE_URL=https://<api-host>`でWebをbuild、deployする。
7. Webの全route、更新操作、カード画像、スクリーンショット画像、
   Access再認証、管理者拒否を確認する。
8. API WorkerのCron Triggerを有効にする。
9. 旧Workerと旧Access applicationを削除する。

手順2から8までWeb画面または定期クロールが停止する可能性を許容する。
停止を避けるための並行稼働、二重Cron、旧APIへのfallbackは実装しない。

## 検証コマンド

実装完了時は少なくとも次を実行する。

```bash
pnpm --filter @dm-price-tracker/api run test
pnpm --filter @dm-price-tracker/api run type-check
pnpm --filter @dm-price-tracker/api run build
pnpm --filter @dm-price-tracker/web run test
pnpm --filter @dm-price-tracker/web run type-check
pnpm --filter @dm-price-tracker/web run build
pnpm run ai-check
```

API単体の疎通確認:

```bash
pnpm --filter @dm-price-tracker/api exec hono request src/app.ts -P /api/health
```

本番相当では、通常ブラウザでWebへログインしてからcross-origin APIを
操作する。IncognitoだけをAccess CORSの判定基準にしない。

## 完了条件

- `apps/www`が存在しない。
- `next`、`@opennextjs/cloudflare`、Next.js設定、OpenNext設定が残っていない。
- Webの全7 URLがTanStack Routerで表示・遷移できる。
- 全API endpointのmethod、path、status、payload、認証、D1・R2動作が
  移行前と同じである。
- Webから別originのAPIへ、Access cookie付きでqueryとmutationを実行できる。
- 許可外originからcredential付きAPIを呼べない。
- 一般利用者が管理画面と管理APIを利用できない。
- GitHub Actionsが新しいAPI URLから対象取得、結果送信、失敗通知できる。
- CronがAPI Workerだけで30分ごとに1回実行される。
- DB migrationとR2 lifecycle操作が`apps/api`のWrangler設定を参照する。
- API test、Web test、type-check、build、`pnpm run ai-check`がすべて成功する。
- リポジトリ内に`apps/www`、Server Actions、Server Components、
  Next.js Route Handler、旧公開URLへの参照が残っていない。

## 対象外

- SSR、SSG、TanStack Startの導入
- 旧URLから新URLへのredirect
- 旧APIと新APIの並行稼働
- 旧APIへのfallback
- API versioning
- 検索条件、ページ番号、期間選択のURL search params化
- UIデザインや業務仕様の変更
- D1 schemaや既存データの変更
- controller、use case、API contract packageなどの新しい層の追加

## 参考資料

- [TanStack Router: File-Based Routing](https://tanstack.com/router/latest/docs/routing/file-based-routing)
- [TanStack Router: Routing Concepts](https://tanstack.com/router/latest/docs/routing/routing-concepts)
- [TanStack Router: External Data Loading](https://tanstack.com/router/latest/docs/guide/external-data-loading)
- [TanStack Router: Data Loading](https://tanstack.com/router/latest/docs/guide/data-loading)
- [TanStack Router: Not Found Errors](https://tanstack.com/router/latest/docs/guide/not-found-errors)
- [Hono: RPC](https://hono.dev/docs/guides/rpc)
- [Hono: CORS Middleware](https://hono.dev/docs/middleware/builtin/cors)
- [Hono: CSRF Protection](https://hono.dev/docs/middleware/builtin/csrf)
- [Cloudflare Access: Authorization cookie](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/)
- [Cloudflare Access: CORS](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/)
- [Cloudflare Workers: Single Page Application](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)
