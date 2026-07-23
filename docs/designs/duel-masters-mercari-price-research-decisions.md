# デュエルマスターズ メルカリ価格リサーチ 決定事項

`duel-masters-mercari-price-research.md`(元メモ)をもとに `/grill-with-docs` で議論した内容の記録です。用語集は `CONTEXT.md`、アーキテクチャ判断は `docs/adr/` を参照してください。

## 1. Card とメルカリ収集条件の関係

- Cardは、公式サイトから取得した型番idごとに1件作る。同じカード名でも公式サイトの型番idが異なれば別のCardとして扱う。
- 型番idから「シークレット」等の意味を自動判別できないため、利用者向けの表示名を推測して追加しない。同名のCardはカード名と画像で区別する。型番id自体は画面に表示しない。
- 利用者は、1つのCardにつき現在使用する収集設定を1件だけ登録できる。
- メルカリで使用する検索内容は、編集できない公式カード名と、利用者が任意で入力する「メルカリ検索の追加ワード」で構成する。追加ワードは最大3単語とする。
- 同一利用者が追加ワードを変更した場合は、現在使用する収集設定を切り替える。1つのCardに複数の設定を同時登録する操作にはしない。
- 公式カード名は固有名詞として固定し、語順を並べ替えない。
- 追加ワードと除外ワードは単語単位で正規化し、比較用の順番を統一して、同じ単語の重複を取り除く。
- Card、正規化後の追加ワード、正規化後の除外ワードが同じ収集条件は、利用者が異なっても内部では同じクロールを共有し、30分ごとに1回だけ実行する。入力時の単語順が違うだけの条件について、別々のクロールを実行しない。

## 2. 利用者向け一覧画面の粒度

- 「価格チェック中」の1行は、利用者が選択した1つのCardと、そのCardで現在使用している収集設定の組み合わせとする。
- カード名による検索と、Cardが属するProductによる絞り込みを必須とする。
- 同じカード名でも公式サイトの型番idが異なるCardは別々に表示し、カード画像で区別できるようにする。
- 一覧や価格詳細に、他の利用者の収集設定、追加ワード、除外ワードを表示しない。

## 3. パイプラインの層分け

- **クローラー(Job、Playwright)**: メルカリの検索結果一覧ページから、出品ごとに `title` `price` を直接抽出し `Record` に保存する(決定事項16参照)。検索結果は仮想化リストでビューポート近傍の出品しかDOM上に存在せず、スクロールで通過した範囲は評価時点で失われるため、詳細ページには遷移せずこの一覧DOMから抽出する。
- **クロール完了後の処理**: `cf-crawler-core` の `BaseOrchestrator.run()` に、Execute完了(`finish()`)直後の`afterFinish()`フックを実装済み(`docs/adr/0001-crawl-completion-hook.md`参照)。デフォルトでは何も実行しない。
  - `mercari-crawler`がこのフックをオーバーライドし、`Record`を読んで枚数抽出・単価正規化・中央値計算を行い、表示用DBへ書き込む。
- **バックエンド(Hono または Next.js SSR、将来別リポジトリ)**: 表示用DBを読み、最低限の join だけを行って画面に渡す。複雑なロジックはここに置かない。

## 4. 枚数抽出・外れ値のルール

- 出品タイトルに「n枚」等の明示的な枚数表記があれば、`価格 ÷ n` を1枚あたり単価とする。
- 表記がなければ1枚とみなす(1枚出品は枚数を明記しないことが多いため)。
- 複数カードのまとめ売りは、SearchCondition の除外キーワード(メルカリの `exclude_keyword` パラメータ)でクロール時点の検索結果から除外する。事後判定はしない。
- 除外ワードは利用者が設定する。除外ワードは1つのCardにつき3枠固定とする。この3枠のうち、共通除外ワードで指定した単語がまず埋まり、残った枠にCard別の追加除外ワードを入れる。合計の上限は3単語であり、共通とCard別を合算して6単語にはならない。
- 共通除外ワードの初期値は「まとめ」「専用」の2枠、残る1枠は空欄とする。初期値を暗黙に適用せず、利用者が確認・編集できる状態で表示する。
- 共通除外ワードを変更した場合は、その利用者が価格チェック中のすべてのCardへ即時同期する。Card別編集画面の共通枠にも同じ値が表示される。
- 利用者は複数のCardを選び、Card別追加除外ワードを一括で追加できる。一括操作の対象と変更内容は画面上で明示する。共通枠で既に埋まっている枠は上書きしない。
- 2026-07-22の実画面確認では、メルカリの`exclude_keyword`に空白区切りで複数単語を指定すると、いずれかの単語を含む出品が除外された。ただし、これは公式仕様として保証された挙動ではなく、確認時点の挙動である。
- 販売中・売り切れは問わず、新着順(`sort=created_time&order=desc`)で取得する。
- 参考URL:
  - 検索例(スコア順、絞り込み前): https://jp.mercari.com/search?keyword=%E4%B8%96%E7%95%8C%E7%AB%9C%E7%9A%87%20%E3%83%9C%E3%83%AB%E3%82%B7%E3%83%A3%E3%83%83%E3%82%AF%E3%83%BB%E3%83%92%E3%82%AB%E3%83%AA%E3%82%B9%E3%83%9E&sort=score&order=desc&category_id=1290
  - 除外キーワード付き・新着順(採用方針に近い形): https://jp.mercari.com/search?keyword=%E4%B8%96%E7%95%8C%E7%AB%9C%E7%9A%87%20%E3%83%9C%E3%83%AB%E3%82%B7%E3%83%A3%E3%83%83%E3%82%AF%E3%83%BB%E3%83%92%E3%82%AB%E3%83%AA%E3%82%B9%E3%83%9E&sort=created_time&order=desc&category_id=1290&exclude_keyword=%E3%81%BE%E3%81%A8%E3%82%81
  - `category_id=1290` はトレーディングカード系カテゴリと見られる。
- 現在の実装ではSearchConditionが`mercari_keyword`と`exclude_keyword`を持つ。ただし、利用者単位の設定と共有クロールへ対応するため、決定事項20に従って再設計する。

## 5. 価格の代表値

- 推移グラフの1時点(30分ごとのクロール実行)の代表値は、そのSearchConditionの検索結果1ページ目にある全出品の1枚あたり単価の**中央値(メディアン)**とする。
- 平均値は一部の高額/安値出品に引っ張られるため不採用。
- この代表値を `PricePoint` と呼ぶ。

## 6. スクリーンショット

- SearchConditionごとに、クロール実行(30分ごと)のタイミングで検索結果1ページ目全体を1枚撮影する。
- 同じ実行の `PricePoint` と同じタイミングで生成され、詳細画面で価格推移と並べて表示する。
- 保持期間は3日間(元メモの決定を踏襲)。
- 既知の制約: 検索結果は仮想化リストのため、`fullPage`撮影時にビューポート近傍以外のDOMが削除された状態で撮影されることがあり、プレースホルダー(未読み込み)表示が一部混在する。Chromiumの`captureBeyondViewport`はビューポートを仮想拡大して撮影する仕組みだが、仮想化リストは表示範囲外のDOMごと削除するため、撮影時点で再度スクロールが必要な箇所は元のDOMに戻せない。スクロール&スティッチ合成以外に業界標準の回避策がないため、「最低限見える部分だけ取得する」を許容する。

## 7. 管理者と利用者の役割

- 管理者は、公式サイトの商品一覧を手動で同期し、同期済みの商品を選んで商品単位でカード情報の取得を開始する。メルカリの追加ワードや除外ワードは設定しない。
- 利用者はカードを探し、カードを選んで価格チェックを開始する。これはブックマークではなく、継続的な価格収集を開始する操作である。
- カードを選んだ時点では、公式カード名と利用者の共通除外ワードを使って設定を完了し、価格チェックを開始する。追加ワードとCardごとの除外ワードは「価格チェック中」の一覧から後で編集できる。
- 利用者の収集設定は利用者ごとに非公開とし、他の利用者や管理者の設定を画面に表示しない。
- 実際のメール/Push通知送信はMVPスコープ外とする。
- 複数利用者が同じ収集条件を見ている場合、1人が価格チェックをやめてもクロールを停止しない。最後の1人がやめた時点で新しいクロールを停止する。
- 価格チェックをやめても過去の価格履歴と収集設定は削除しない。同じ収集条件が再び選ばれた場合は、過去の履歴を引き継いでクロールを再開する。
- 既存の共有収集条件を新たに選んだ利用者には、その利用者が選ぶ前に蓄積された価格履歴も表示する。
- 追加ワードを変更した場合は別の収集条件として履歴を分け、価格グラフに混在させない。以前と同一の追加ワードへ戻した場合は、以前の履歴を再利用する。
- 除外ワードの変更は検索結果の調整として扱い、利用者向けの価格グラフは変更前後を連続した履歴として表示する。変更位置を示す注記は表示しない。

## 8. 表示用DBの所有構成

- メルカリクローラー・公式サイトクローラー・バックエンドの3プログラムが、同一のD1データベースにそれぞれ直接バインドして読み書きする。
- 事実確認: Cloudflare D1は、同じ`database_id`を複数の異なるWorkerプロジェクト(別々の`wrangler.jsonc`)から`d1_databases`バインディングとして参照できる。
- 理由・トレードオフ: `docs/adr/0002-shared-d1-for-display-database.md` 参照。
- 開発順序(背景): 方針・要件を確定 → `cf-crawler-core` を改修 → 要件を満たすクローラーをこのリポジトリ(`cf-crawler`)で作成 → 動作確認 → 必要な部分だけをコピーして新規モノレポ(`apps/` に画面とクローラーが同居、`packages/` に `cf-worker-core`)を作成する。このリポジトリでNext.js製の画面は作らないが、画面とクローラーが別リポジトリに分かれるわけではなく、最終的には同じモノレポの `apps/` 配下に同居する。

## 9. Card の重複排除・クロール単位

- Card の主キーは公式サイトの型番id文字列(例: `dm26ex2-PR001`)をそのまま使う。サロゲートキーは別途発行しない。
- 公式サイトクローラーは、商品(収録弾)一覧ページからidの一覧を取得したのち、表示用DBに未登録のidのみ詳細ページをクロールする(無駄なクロールを避けるため)。
- 公式サイトクローラーは商品(収録弾)単位でのみクロールを実行できる(例: `dm26ex2` を指定してクロール)。商品を横断した全量クロールのような操作は提供しない。
- 事実確認:
  - 商品一覧ページ(例: `products=26ex2`)内でidの重複は確認されなかった。
  - 同一カード名が複数の商品に再録される場合、商品ごとに別idが振られる(例: 「引き裂かれし永劫、エムラクール」が `dm26ex2` `dm23ex3` `dmex18` `dmex08` の4商品に収録され、それぞれ別id)。
  - 一部のバリアントはidの接尾辞で機械的に区別できるケースを確認した(例: `dm26ex2-PR002` と `dm26ex2-PR002CHO`)。
  - 「シークレット」「xxシークレット」のようなバリアントは別idで登録されるが、id文字列自体からバリアントの意味は判別できないことを確認した(決定事項19参照)。画面では意味を推測した表示名を付けず、別Cardとしてカード名と画像で区別する。

## 10. 利用者画面のカード検索

- Card名に対する `LIKE '%keyword%'` のあいまい検索で実装する。FTS5等の全文検索は導入しない。
- 理由: 対象データ規模がMVPでは数百件程度と小さく、日本語対応のためのトークナイザー設定など全文検索の追加コストに見合わない。
- 事実確認: D1はFTS5モジュールと通常の`LIKE`検索の両方をサポートしている。

## 11. クロールの実行条件

- Cloudflareの Cron Trigger のスケジュール自体(例: `*/30 * * * *`)は `wrangler.jsonc` に固定し、実行のたびに変更しない。
- 事実確認: Cloudflare Cron Triggerのスケジュールは`wrangler.jsonc`かダッシュボードでのみ変更可能で、Workerのコードから動的に変更することはできない。一方で`scheduled()`ハンドラー内で「今回は処理をスキップする」という制御は可能。
- 正規化後の同一収集条件を価格チェック中の利用者が1人以上いる間だけ、その収集条件を30分ごとに1回クロールする。利用者数に応じてクロール回数を増やさない。
- 価格チェック中の利用者が0人になった収集条件は、次回以降のクロール対象から外す。
- 有効な収集条件は、cf-crawler-core既存の並列処理(チャンク単位のJob実行)にそのまま乗せる。個別の並列処理機構を新たに作る必要はない。

## 12. 認証・ユーザー管理

- 開発者 = 管理者 = 自分。ユーザーは友人(複数人)。開発者自身は価格閲覧のニーズを持たない(管理者としてのみ関与する)。
- 認証はCloudflare Access(Zero Trust)に委譲する。独自のログイン画面・パスワード管理・セッション管理は実装しない。
- ログイン方式はOne-time PIN(入力したメールアドレス宛にワンタイムコードを送る)。利用者側のCloudflareアカウント作成は不要。
- パスごとにAccessアプリケーション/ポリシーを分ける: `/admin` 配下は自分のメールアドレスのみ許可し、それ以外の閲覧画面は友人のメールアドレスもAccessの許可リストに追加して保護する。
- バックエンドはリクエストの `Cf-Access-Jwt-Assertion` ヘッダーのJWTを検証する(`jose`パッケージ、`https://<チーム名>.cloudflareaccess.com/cdn-cgi/access/certs` の公開鍵、issuer/audienceを確認)。検証済みJWTペイロードの `email` クレームを取得する。
- User の主キーはメールアドレスをそのまま使う。サロゲートキーは発行しない。初回アクセス時に自動でUser行を作成する(サインアップ画面は作らない)。
- 実装例(Cloudflare Workers、`jose`パッケージ):
  ```ts
  import { jwtVerify, createRemoteJWKSet } from "jose";

  const JWKS = createRemoteJWKSet(
    new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`),
  );
  const token = request.headers.get("cf-access-jwt-assertion");
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: env.TEAM_DOMAIN,
    audience: env.POLICY_AUD, // Accessアプリケーションごとに発行されるAUDタグ
  });
  const email = payload.email; // Userの識別子
  ```
- 理由・トレードオフ: `docs/adr/0003-delegate-auth-to-cloudflare-access.md` 参照。

## 13. バックエンドの技術構成

- Next.js App Router のキャッチオールルート(`app/api/[[...route]]/route.ts`)に、`hono/vercel` アダプタ経由でHonoアプリケーションをマウントする。
- 画面(Next.js)とAPI(Hono)は別Workerに分けず、1つのWorkerとしてデプロイする。
- 事実確認: この構成はHono公式ドキュメントに記載されている。Web標準のRequest/Responseで動作するため、Vercel以外の環境(OpenNext.js for Cloudflare)でも動作するはず(名称は`hono/vercel`だがVercel専用ではない)。

## 14. 公式サイトクローラーの起動経路

- 管理画面(バックエンド)から公式サイトクローラーを起動する経路は、Service Bindingsを新規実装する。
- 事実確認: 現状のcf-crawlerテンプレート(`minimal-crawler`、`city-heaven-crawler`)はHTTP `fetch` ハンドラー(`POST /crawl`、認証なし)のみで、Service Bindingsの仕組みは`wrangler.jsonc`に存在しない。今回新規実装が必要。
- 理由: Service Bindingsは外部に公開されないWorker間の内部呼び出しのため、認証の実装自体が不要になる。
- 2026-07-22時点の実装: `WorkerEntrypoint`の`crawl(productCode)`をService Binding向けRPCとして実装した。呼び出し側のバックエンドとBinding設定はコード上に存在しない。
- 管理画面では「商品一覧を更新」と「商品を追加」を別の操作として提供する。
  - 「商品一覧を更新」は、管理者が必要な時だけ公式サイトの商品一覧を取得し、Productマスターへ同期する。定期実行はしない。この同期処理は2026-07-22時点で未実装である。
  - 「商品を追加」は、同期済みのProductから対象を選び、既存の`crawl(productCode)`を呼び出して、その商品に属するCardを取得する。

## 15. Product エンティティの新設

- 公式サイトが「商品」と呼ぶ単位(例: `DM26-EX2 悪感謝祭 カリスマBEST`)を、Productという独立したエンティティとして新設する。
- 理由: パック商品(ランダム封入)とデッキ商品(40枚固定)の両方が存在するため、「パック」「収録弾」という呼称では両方をカバーできない。公式サイトの実際の呼称に合わせて「商品(Product)」で統一する。
- Productの主キーは、公式サイトのURLパラメータで使われるコード(例: `26ex2`)とする。
- Card は1つの Product に属する(N:1)。
- Productのレコードは、管理者が管理画面の「商品一覧を更新」を実行した時だけ、公式サイトの商品一覧ページ(https://dm.takaratomy.co.jp/card/)から同期する。商品追加の頻度が低いため、定期実行はしない。
- 管理者の商品一覧には、Cardの取得を開始したProductだけを表示し、取得中・完了・失敗を確認できるようにする。Cardを未取得のProductは「商品を追加」の選択画面で検索する。
- 管理者の商品一覧にCard数は表示しない。管理者向けにCard名やメルカリ収集設定を確認・編集する画面は設けない。
- `CONTEXT.md` を更新済み: Product を用語集に追加し、Card定義の「商品名マスター」という表現を「カードマスター」に修正した。

## 16. メルカリクローラーのJob生成フロー

- 検索結果1ページ目のみを対象にLISTジョブ1件を作成する。ページネーションがあっても2ページ目以降のJobは作成しない。
- 検索結果はIntersectionObserverによる無限スクロールで1ページ目内の出品を追加読み込みするため、LISTジョブ内で件数が増えなくなるまでスクロールしてから出品を取得する。
- 検索結果は仮想化リストで、ビューポート近傍の出品しかDOM上に存在しない。スクロールで通過した範囲は評価時点で失われるため、出品ごとの`title`/`price`は一覧DOMから直接抽出し(決定事項3参照)、詳細ページ用のJob(旧DETAIL kind)は作成しない。
- 検索結果のDOM構造とセレクタは検証済み(決定事項23参照)。

## 17. 画像・スクリーンショットの保存先

- Card/Product画像: 公式サイトの画像URLを直接使わず、一度R2にアップロードしてそこから配信する。
- Screenshot: R2に保存する(D1へのBLOB格納は不採用)。
- 理由: D1はSQLiteベースで大容量バイナリの格納に向いておらず、Cloudflareも画像等のバイナリ資産はR2での保存を推奨している。

## 18. PricePointの保持期間

- 無期限保持とする。
- 事実確認: Cloudflare D1はWorkers Paidプランで1データベースあたり10GBまで使用可能。SearchCondition数200件・30分間隔・1レコード50バイト程度と試算すると、1年で約175MB、10GB到達には約50年かかる計算となり、容量は実質問題にならない。

## 19. カード名バリアントのid区別(検証事項14の確定)

- 「シークレット」「xxシークレット」のようなバリアントには異なる型番idが付与される。ただし、id文字列の規則だけからバリアントの種別を判別することはできない。
- 同じカード名でも別idであれば別Cardとして扱う。利用者はカード画像で対象を選ぶ。
- idから意味を判別できないため、「シークレット」等の表示名や追加ワードを自動で補わない。必要なメルカリ検索の追加ワードは利用者が登録する。

## 20. 表示用DBスキーマの再設計

既存の`search_conditions`と`watches`を中心としたDDLは実装済みだが、2026-07-22に確定した利用者単位の設定とクロール共有の要件を満たさないため、最終スキーマではない。次の要件を満たすように再設計する。

- 利用者ごとに、1つのCardにつき現在使用する収集設定を1件だけ保持する。
- 利用者の共通除外ワードを最大3単語保持する。Card別の除外ワードは、共通除外ワードで埋まった枠を除いた残り枠にだけ入る。1つのCardあたりの除外ワードは共通とCard別を合わせて3枠固定である。
- 公式カード名、追加ワード、除外ワード(共通+Card別、合計3枠)を正規化し、同一の収集条件を複数利用者で共有できるようにする。
- 同一の共有収集条件に対する価格点とスクリーンショットは、クロール1回につき1組だけ保存する。
- 共有収集条件を価格チェック中の利用者が1人以上いるかを判定できるようにし、0人になった場合は履歴を削除せずクロールだけを停止する。
- 追加ワード変更時は履歴を分け、以前と同一の収集条件へ戻した場合は以前の履歴を再利用する。
- 除外ワード変更前後の価格点を、利用者向けには1つの連続した価格履歴として取得できるようにする。
- PricePointは無期限保持し、Screenshotは3日間保持する。
- Card/Product画像とScreenshotの実体はR2に置き、表示用DBにはR2オブジェクトキーを保存する。

単語単位の正規化、順番の統一、重複排除を行うことは確定している。文字種や空白をどこまで同一視するかという実装上の詳細と、除外ワード変更前後の履歴を結合する具体的なデータ構造、テーブル名、主キー、DDLは決定事項27・29で確定し、決定事項30で最終スキーマとして実装済み。

## 21. BaseOrchestratorのafterFinishフック実装(ADR 0001の実装完了)

決定事項8の開発順序のうち「`cf-crawler-core` を改修」が完了した。

- `BaseOrchestrator.run()` に `afterFinish(execute: Execute, db: CrawlerDatabase): Promise<void> | void` を新設した(`packages/cf-crawler-core/src/operations/BaseOrchestrator.ts`)。`finish()` 呼び出し直後に `step.do` でラップして呼ばれる。
- デフォルトでは何もしない。xxx-crawler(例: mercari-crawler)側でオーバーライドし、Recordを読んで枚数抽出・単価正規化・中央値計算を行い、表示用DBへ書き込む(決定事項3参照)。
- 事実確認: `records`テーブルには`executeId`カラムがないため、`records.jobId → jobs.executeId`のJOINで対象Executeに属するRecordを漏れなく一意に取得できる(`jobs.executeId`・`records.jobId`はともにNOT NULLの外部キー)。
- `afterFinish`が例外を投げた場合は伝播し、Workflow(Execute)全体が失敗扱いになる。既存の`initializer`・`processJobs`・`finish`と同じOrchestratorレベルのエラー処理(握りつぶさない)に統一した。
- テストは `packages/cf-crawler-core/test/integration/workflows-runtime.test.ts` に正常系・異常系を追加済み。

その後、旧設計の表示用DBマイグレーションと`apps/mercari-crawler`の実装が完了した。`mercari-crawler`の`afterFinish()`は、対象ExecuteのRecordを集計して`price_points`へ、起点LISTジョブの情報を`screenshots`へ保存する。`price_points`・`screenshots`のテーブル構造は決定事項30のスキーマ再設計でも変更していないため、`afterFinish()`側の実装は変更不要だった。

## 22. スクリーンショット撮影(決定事項6)のJob組み込み方法

- スクリーンショットは、検索結果ページを取得する既存のLISTジョブ(決定事項16)の中でPlaywrightの同一ページロード中に撮影し、R2へ直接アップロードする(`createJobs`/`createRecords`の戻り値とは別の副作用として実行)。
- 専用の`SCREENSHOT` kindジョブを新設する案は不採用。同じ検索URLへ2回アクセスすることになり、Browser Run時間(未決事項12)が実質倍になるため。
- R2オブジェクトキーはjob.idなど、LISTジョブのworker()実行時点で判明する値から決定的に組み立てる。`afterFinish`は`jobs`テーブルを`kind = 'LIST'`で検索してSearchCondition単位のjob行(id・crawledAt・meta中のsearch_condition_id)を特定し、そのjob.idからR2キーを再構築し、job.crawledAtをScreenshot.crawled_atとして使う。
  - 事実確認: `saveChildJobs`/`saveJobRecords`はJobがFINISHEDになったタイミングで`crawledAt`をD1に書き込む(`packages/cf-crawler-core/src/lib/repository.ts`)。`afterFinish`はExecute完了後に呼ばれるため、対象Execute配下の全Job(LISTジョブ含む)は既に`crawledAt`が確定済みの状態で読み取れる。
  - 事実確認: `BaseOrchestrator.initializer(params)`は`this.env`を参照できる非同期メソッドとして定義されており(`packages/cf-crawler-core/src/operations/BaseOrchestrator.ts`)、curlパラメータに依存せず表示用DBを直接クエリして有効なSearchConditionを取得できる。これにより決定事項11の「Cron Triggerからの起動」でも`initializer`内で有効なSearchCondition一覧を取得しJobを生成できる。

## 23. サイトDOM調査(未決事項7の解消)

2026-07-21に、決定事項4の検索URL例を`agent-browser`で実際に表示して確認した。

### メルカリ検索結果ページ

- 出品リンク: `a[data-testid="thumbnail-link"][href^="/item/"]`
- 出品URL: 上記要素の`href`をページURL基準で絶対URL化する。
- 一覧上の商品名: 上記要素内の`[data-testid="thumbnail-item-name"]`のテキスト。決定事項3・16により、Recordへ保存する値はこの一覧DOMから直接取得する。
- 一覧上の価格: 上記要素内の`.merPrice`のテキストから数字以外を除去して整数化する。`.merPrice`はビルドハッシュを含まない安定したクラス名。`[data-testid="price"]`は詳細ページ専用で一覧には存在しない。
- 表示完了: 商品がある場合は上記の出品リンク、0件の場合は`出品された商品がありません`という表示を確認できた。継続的な通信の影響を受ける`networkidle`は使用せず、このどちらかが表示されるまで待機する。
- ページネーション: ページ番号一覧や総ページ数は表示されず、リンク本文が`次へ`の`a[href]`だけが次ページを示す。2ページ目では`前へ`と`次へ`が表示された。
- ページURLはカーソル式で、調査時は1ページ目から2ページ目が`page_token=v1:1`、2ページ目から3ページ目が`page_token=v1:2`だった。実装では1ページ目だけを対象とするため、`page_token`と`次へ`リンクは使用しない。
- 無限スクロール: 1ページ目内でもIntersectionObserverによる追加読み込みが発生し、出品リンクの件数がスクロールに応じて増える。件数が増えなくなるまでスクロールしてから出品を取得する必要がある(決定事項16参照)。

### メルカリ商品詳細ページ(決定事項16によりDETAILジョブ廃止、現在は未使用)

調査時点ではDETAILジョブでの取得を想定していたが、決定事項16の通りDETAILジョブ自体を廃止したため、以下のセレクタは現在使用していない。調査記録として残す。

- `title`: `[data-testid="name"] h1`のテキスト
- `price`: `[data-testid="price"]`のテキストから数字以外を除去して整数化
- `image_url`: `[data-testid="carousel"] [data-testid="carousel-item"] img[src]`の`src`
- `item_url`: Playwrightで表示した詳細ページの`page.url()`
- CSSクラス名にはビルド由来のハッシュが含まれていたため使用せず、`data-testid`と構造で抽出する。

### デュエル・マスターズ公式カードサイト

参考資料の内容を2026-07-21に実DOMで確認し、公式サイトクローラー実装前の2026-07-22に検索リクエストを追加調査した。

- 一覧ページの初期HTMLには`a[href*="/card/detail/?id="] img.cardImage`があるが、GETの`v` JSONへ別商品コードを指定しても、初期HTMLは最新商品(調査時は`26ex2`)の50件のままだった。商品絞り込み結果はJavaScriptが後から反映する。
- JavaScriptは`POST https://dm.takaratomy.co.jp/card/`へ`application/x-www-form-urlencoded`で検索条件を送り、HTML断片を受け取って一覧を差し替える。`products=spdeck13&pagenum=1`で`spdeck13-*`の11件だけが返ることを、ブラウザーのネットワークログと同じPOSTを使ったcurlの両方で確認した。実装はBrowser Renderingではなく、この公式XHRを直接使用する。
- ページ番号はPOST bodyの`pagenum`、ページ総数はレスポンス内の`.wp-pagenavi [data-page]`から取得できる。カード名等の詳細テキストは一覧要素内に存在しない。
- 詳細ページでは`h3.card-name`、`h3.card-name span.packname`、`td.type`、`td.civil`、`td.rarelity`、`td.power`、`td.cost`、`td.mana`、`td.race`、`td.illusttxt`、`td.skills li`、`td.flavor`、`.card-img img[src]`を確認した。表示用DBが使用するカード名と画像だけを保存する。
- キーワード絞り込みは機能する。前回の参考URLでは`v` JSONに`keyword`キー自体がなく、絞り込みが適用されていなかった。検索フォームから`keyword=ボルシャック`を送信すると、`26ex2`の商品絞り込み内で50件から10件へ減り、生成された`v` JSONにも`keyword`が含まれた。公式XHRでも同じ`keyword`フィールドを送信できる。ただし今回のクローラーは決定事項9により商品コード単位で全カードIDを取得するため、キーワード絞り込みは実装に使用しない。

## 24. メルカリクローラー実装時の確定事項

以下の識別子とDB参照は現在の実装についての記録である。利用者単位の設定と共有クロールへ対応する際は、決定事項20の再設計に合わせて変更する。

- 最新の販売だけを見る目的のため、検索結果は1ページ目だけをクロール対象とする。ページネーションの存在は確認済みだが、2ページ目以降のLISTジョブは作成しない(決定事項16へ反映済み)。
- Screenshotは価格計算の対象となる検索結果1ページ目全体を撮影する。
- R2 bucket名は`mercari-crawler-screenshots`、binding名は`SCREENSHOTS`とする。
- ScreenshotのR2キーは`screenshots/{search_condition_id}/{LISTジョブID}.png`とする。SearchCondition単位で整理でき、LISTジョブ情報から決定的に復元できる。
- R2の`screenshots/`プレフィックスへ、アップロードから3日後に削除するObject Lifecycle Ruleを設定する。キーへ日付を含めてWorkerから削除処理を行う方式は採用しない。R2の仕様上、期限到達後の実削除には通常24時間程度の遅延がありうる。
- 手動実行用の`POST /crawl`は提供しない。Cron Trigger(`*/30 * * * *`)だけを起動経路とし、実行時にDISPLAY_DBから有効なSearchConditionをすべて取得する。

## 25. 実装状況の棚卸し(2026-07-22時点)

コードベース(`apps/`・`packages/`)の実装状況を記録する。

### 実装・検証済み(コードで確認済み)

- `apps/mercari-crawler`: LISTジョブ生成(`MercariCrawlerOrchestrator.ts`)、一覧DOM抽出・無限スクロール対応(`MercariCrawlerJob.ts`)、`afterFinish`での価格集計・DB書き込み(`crawlResultRepository.ts`・`priceAggregation.ts`)を実装済み。旧設計での実データE2E確認済み(60件のrecords取得、price_points・screenshots反映を確認)。決定事項30のスキーマ再設計後は型チェック・既存テストで確認済みだが、新スキーマでのE2E再確認は未実施。
- `migrations-display-db/`に決定事項30で確定した最終スキーマのDDL(products/cards/price_series/search_conditions/price_points/screenshots/users/card_watches)が適用済み。
- `wrangler.jsonc`に`DB`・`DISPLAY_DB`のD1バインディング、`SCREENSHOTS` R2バケット、Cron Trigger(`*/30 * * * *`)、Workflowsの設定が揃っている。
- `packages/cf-crawler-core`の`afterFinish`フック(決定事項21)、`saveJobRecords`のD1バインド変数上限バグ修正(コミット6c47215)。
- `apps/duel-masters-official-crawler`: Service Binding向けRPC、公式検索XHRによる商品内全ページのID取得、DISPLAY_DBとの差分抽出、カード名取得、R2画像保存、Product/Card登録を実装済み。全商品を横断する起動経路は設けていない。実商品`spdeck13`でクロール処理を確認済み(初回はDETAIL・Record・Card・R2画像が各11件、再実行はDETAIL・Recordが0件)。

### 未着手(コード上に存在しない)

- **バックエンド(Next.js + Hono、管理画面CRUD、カード一覧・詳細画面、Watch機能)**: `apps/`配下に該当ディレクトリなし。決定事項7・10・12・13の実装部分は未着手。

### 未確認(コードからは判定不可、要運用側確認)

- `screenshots:lifecycle:add`(決定事項24のR2 Object Lifecycle Rule)を実際に実行済みかどうか。手動の1回限りセットアップコマンドで、実行有無はローカルコードから判定できない。
- `apps/mercari-crawler`を実際にCloudflareへ本番デプロイ済みかどうか、Cron Triggerが本番で稼働しているかどうか。
- Cloudflare Access(決定事項12)の実際のポリシー設定状況。ダッシュボード側の設定のためコードには現れない。
- バックエンドからService Binding経由で公式サイトクローラーを起動する一連の動作。バックエンドは未実装。

## 26. ウォークスルーHTMLの画面要件

- PC向けの単一HTMLとし、バックエンド接続やデータ保存を行わない。管理者側と利用者側の操作を試せるモックとする。
- 管理者画面と利用者画面は明確に分け、管理者向け操作を利用者へ表示しない。同じCardデータを使う場合も、目的に応じて表示内容を分ける。
- 管理者の商品一覧では取得中・完了・失敗を確認できるようにする。取得ステータス専用画面やジョブログ画面は作らない。
- 利用者はカード名でCardを探す。文明による絞り込みや文明ラベルは設けない。
- Cardを選ぶ操作は「お気に入り」「保存」と表現せず、価格チェックを開始する操作であることが伝わる短い名称にする。
- 「SearchCondition」や「検索語」は画面に表示しない。利用者が編集する項目は「メルカリ検索の追加ワード」のように、用途が分かる文言にする。
- 複数Cardを対象にする操作は「まとめて設定」だけでは何が変わるか分からないため、「選択したカードに除外ワードを追加」のように変更内容を明示する。
- 利用者向けの価格詳細では、Card名、Card画像、現在価格、価格推移、金額の取得元を確認できるようにする。特にCard名、Card画像、現在価格、価格推移を優先して表示する。
- 価格グラフ上の時点を選ぶと、選択した日時、価格、同じクロールで取得したメルカリ検索結果画像を連動して切り替える。
- PricePointは無期限に閲覧できる。3日より古い時点を実際に選び、対応するScreenshotが残っていない場合に限り、その旨を表示する。画像保持の制約を常設の注意書きにはしない。
- 「取得日時」「算出方法」「対象」「画像の保存期間」を並べた説明欄、検索結果1ページ目という内部仕様、利用者サイドバーの「最近見た価格」、共有ボタンは設けない。
- 実装済み処理とHTML内だけの仮操作を混同させない。ただし、各画面へ実装状況の長い説明は置かない。

## 27. 収集条件の正規化ルールと表示用DBの履歴結合設計(未決事項3の解消)

`/grill-with-docs`でNotebookLM上の「達人に学ぶDB設計徹底指南書 第2版」を参照しながら議論した。

- 文字種の正規化は全角/半角統一のみ行う。大文字小文字、ひらがな/カタカナの統一はしない。過度な統一による意図しない収集条件の混同(意味が変わりうる単語同士が同一視される)を避けるため。
- 1枠(追加ワード・除外ワードとも)に空白区切りで複数語が入力された場合は入力エラーとする。「1枠=1単語」を維持し、決定事項13の単語単位の正規化・重複排除ロジックとの整合を保つ。
- 表示用DBに、Card×正規化追加ワードを自然キーとする`PriceSeries`(価格履歴の系列単位)を新設する。クロール実行単位(Card×正規化追加ワード×正規化除外ワードの完全一致。決定事項3の共有クロール条件)は`SearchCondition`として`PriceSeries`の子(1:N)に持つ。`PricePoint`の参照先は決定事項29で確定した(`PriceSeries`ではなく`SearchCondition`を直接参照する)。
- 根拠: 「達人に学ぶDB設計徹底指南書 第2版」8-2節は、キーは同じだが指す対象の内実が変化するケース(「一意キーはあるが、途中で指す対象が変化する」パターン)に対し代理キーではなく意味のある自然キーによる解決を推奨し、同書7-7節は複数の世代テーブルをJOIN/UNIONで結合する「ダブルマスタ」を明確なアンチパターンとしている。この原則に沿い、`SearchCondition`同士をチェーン状にJOIN/UNIONして辿る設計は避けた(具体的な結合方法は決定事項29)。

## 28. 複数Cardへの一括除外ワード追加時、空き枠不足のCardがある場合の扱い(未決事項4の解消)

- 一括追加の対象Cardの中に、除外ワード3枠が既に埋まっていて空きがないCardが含まれていた場合、そのCardの変更はスキップし、空きがあるCardだけ変更する。1件でも条件を満たさないことを理由に全体を中止しない。
- 変更結果(変更できたCard/スキップしたCard)を利用者に一覧表示する。

## 29. 除外ワードが利用者ごとに異なる場合の価格系列の分離(決定事項27の補足確定)

- 前提: 除外ワードは利用者ごとに異なりうる。同じCard×正規化追加ワード(`PriceSeries`)でも、利用者Aと利用者Bが異なる除外ワードを設定していれば、`PriceSeries`の子として複数の`SearchCondition`が同時に並存する。
- 利用者向けの価格グラフに、他の利用者が設定した除外ワードで計算された価格点を混ぜない(決定事項2・17「他の利用者の収集設定・除外ワードを表示しない」の趣旨に沿う)。利用者は自分がこれまで使用した`SearchCondition`の価格点だけを連続して見る。
- `PricePoint`・`Screenshot`は`PriceSeries`ではなく`SearchCondition`を直接参照する(`SearchCondition`単位でクロール1回につき1組保存する決定事項21補足のとおり)。
- 利用者の現在の収集設定を保持する`CardWatch`(旧`watches`)は、値をUPDATEで上書きする1行構成ではなく、設定変更(除外ワード変更など)のたびに新しい行を追加する**追加専用の履歴ログ**として持つ。`(user_email, card_id)`ごとに`is_current = 1`の行は常に1件のみとし、部分ユニークインデックス(`WHERE is_current = 1`)で保証する。
- 利用者の価格グラフは、その利用者の`card_watches`の全行(`is_current`を問わない)が指す`search_condition_id`を集め、それらの`PricePoint`を`crawled_at`順に結合して表示する。以前と同一の除外ワードに戻した場合は正規化後の完全一致で既存の`SearchCondition`が再利用されるため、履歴は自動的につながる。
- この設計により、除外ワード変更履歴専用のテーブル(例: `UserSearchConditionHistory`)を別途新設する必要がない。`card_watches`1テーブルで現在値と履歴の両方を表現する。

## 30. 表示用DBスキーマの最終確定(決定事項20の実装完了)

決定事項20・27・29に沿って`apps/mercari-crawler/src/lib/displayDbSchema.ts`を再設計し、`migrations-display-db`を置き換えた。

- `price_series`を新設。`(card_id, normalized_additional_keyword)`の自然キー(ユニークインデックス)で価格履歴の系列を一意に定める。追加ワードを変更すると別の`price_series`になり、同じ追加ワードへ戻すと既存の`price_series`が再利用される。
- `search_conditions`を`price_series`の子として再設計。保持する列は`price_series_id`と`normalized_exclude_keyword`のみとし、旧`mercari_keyword`(カード名込みの結合済み文字列)・`enabled`・`updated_at`は廃止した。検索用キーワードは`cards.name`と`price_series.normalized_additional_keyword`から都度組み立てる。
- `search_conditions.enabled`列は持たない。クロール対象かどうかは、`card_watches`に`search_condition_id`が一致し`is_current = 1`の行が存在するかを`EXISTS`で判定する。利用者の観測状態を`card_watches`だけに一本化し、二重管理を避けるため。
- `watches`を`card_watches`に改名し、決定事項29のとおり追加専用の履歴ログとして再設計した。設定変更のたびに新しい行を追加し、既存行はUPDATEしない。`(user_email, card_id)`ごとに`is_current = 1`の行が1件だけになるよう部分ユニークインデックス(`WHERE is_current = 1`)で保証する。
- `price_points`・`screenshots`・`users`・`products`・`cards`の構造は変更していない。`price_points`・`screenshots`は決定事項29のとおり`search_condition_id`を直接参照する。
- `apps/mercari-crawler/src/crawler/MercariCrawlerOrchestrator.ts`の`initializer`を、`search_conditions → price_series → cards`のJOINでメルカリ検索キーワードを組み立て、`card_watches`への`EXISTS`でクロール対象を絞り込む実装に更新した。
- 正規化(全角/半角統一、1枠1単語の検証)は、このリポジトリのクローラー側コードには実装していない。`search_conditions`・`price_series`・`card_watches`へ書き込む処理が現状どのクローラーにも存在せず(`mercari-crawler`は`search_conditions`を読むだけ、`duel-masters-official-crawler`は`products`/`cards`しか書かない)、利用者の生入力を受け取る箇所自体がこのリポジトリに存在しないため。正規化は書き込み元となる将来のバックエンドの責務とする。
- 表示用DB(`duelmasters-display-db`)のマイグレーション適用は、従来どおり`mercari-crawler`の`migrations-display-db`のみが担う。`duel-masters-official-crawler`側は`migrations-display-db`を持たず、読み書きする`products`/`cards`の型定義(`src/lib/displayDbSchema.ts`)だけを同じ内容に保つ。
- `migrations-display-db`の旧マイグレーション(`0000_boring_venus.sql`)は削除し、新スキーマから単一の初期マイグレーションを再生成した(開発中のため破壊的変更として扱った)。

## 未決事項(次回以降の議論項目)

### バックエンド

5. Cloudflare Accessの具体的なポリシー設定方法。Workerのカスタムドメイン・ルーティングとAccessアプリケーションのパス粒度(`/admin`とそれ以外)をどう対応させるか。実装詳細として後回し。

### 運用・コスト

12. Browser Runの月10時間枠に対する消費時間試算(SearchCondition数 × 30分間隔での実行時間)。元メモの前提(Workers Paidなら大きな費用はかからないはず)の検証。実装詳細として後回し。
13. クローラーのエラー処理(メルカリ側にブロックされた場合のリトライ・フォールバック方針)。実装詳細として後回し。

## 参考: 公式サイトの関連URL

- カード検索トップ: https://dm.takaratomy.co.jp/card/
- 最新弾一覧の絞り込み例(`products=26ex2`): https://dm.takaratomy.co.jp/card/?v=%7B%22suggest%22:%22on%22,%22keyword_type%22:%5B%22card_name%22,%22card_ruby%22,%22card_text%22%5D,%22culture_cond%22:%5B%22%E5%8D%98%E8%89%B2%22,%22%E5%A4%9A%E8%89%B2%22%5D,%22pagenum%22:%221%22,%22samename%22:%22show%22,%22products%22:%2226ex2%22,%22sort%22:%22release_new%22%7D
- ドギラゴン逆の段の絞り込み例(`products=26rp2`): https://dm.takaratomy.co.jp/card/?v=%7B%22suggest%22:%22on%22,%22keyword_type%22:%5B%22card_name%22,%22card_ruby%22,%22card_text%22%5D,%22culture_cond%22:%5B%22%E5%8D%98%E8%89%B2%22,%22%E5%A4%9A%E8%89%B2%22%5D,%22pagenum%22:%221%22,%22samename%22:%22show%22,%22products%22:%2226rp2%22,%22sort%22:%22release_new%22%7D
- カード個別詳細ページ例: https://dm.takaratomy.co.jp/card/detail/?id=dm26ex2-PR001
