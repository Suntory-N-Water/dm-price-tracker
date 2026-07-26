# クローラー実行基盤のGitHub Actionsへの置換

- 更新日: 2026-07-26
- 状態: 方針検討中
- 対応範囲: 採用方式、要件、設計の決定まで。実装は行わない。

## 背景

現在はCloudflare Browser RunとCloudflare Workflowsを使い、メルカリおよびデュエル・マスターズ公式サイトからデータを取得している。

次の課題を解消するため、ブラウザーを使う取得処理をGitHub Actionsへ置き換える方針を検討している。

- Cloudflare Cron Triggerから起動したブラウザーの実行地域を固定できず、メルカリへ日本向けの条件でアクセスできる保証がない。
- `packages/cf-crawler-core`を含むCloudflare Workflowsの構成が、現在必要な処理に対して複雑である。
- Cloudflare Browser Runの利用時間と料金が、取得対象の増加に応じて増える。
- ブラウザー処理と、検証・集計・永続化などのアプリケーション処理を分離したい。

この文書は検討中の新設計を記録する。本システムは開発中の個人開発であり、後方互換性、既存クローラーとの並行稼働、データ移行期間は設けない。実装時は新方式へ直接置き換え、不要になった旧基盤を削除する。

## 決定事項

### GitHub ActionsとCloudflare Workersの責務分担

- 背景: Playwrightによるページ表示やスクリーンショット取得は重く、Cloudflare Workers上のアプリケーション処理とは実行特性が異なる。
- 採用内容:
  - GitHub Actionsは、外部サイトへのアクセス、Playwright操作、取得ページからのデータ抽出、画像のR2アップロード、Cloudflare APIへの取得結果送信を担当する。
  - Cloudflare Workersは、受信データの認証・検証、価格集計などの後続処理、D1への永続化、実行状態の管理を担当する。
- 理由: 重いブラウザー処理だけをGitHub Actionsへ分離し、業務ロジックと永続化をCloudflare側へ残すことで、責務を明確にできるため。

### メルカリからの取得内容

- 背景: メルカリ検索結果はJavaScriptで描画され、無限スクロールと仮想化DOMを使用しているため、単純なHTML取得だけでは必要なデータを得られない。
- 採用内容:
  - 該当商品の検索ページへ遷移する。
  - 取得対象は、現在監視中のカードから参照される検索条件に限定する。
  - 検索語、除外語、カテゴリ、作成日時順などの検索条件は現行仕様を引き継ぐ。
  - 検索一覧を無限スクロールし、仮想化DOMへ対応しながら商品を収集する。商品詳細ページへは遷移しない。
  - 検索結果のスクリーンショットを取得する。
  - 商品URL、タイトル、金額をPlaywright実行環境で抽出し、URLの重複を除外する。
  - スクリーンショットをR2へアップロードする。
  - 抽出した値とR2オブジェクトキーをCloudflare APIへ送信する。
  - Cloudflare Workers側で、タイトルから枚数を判定し、1枚当たり価格の中央値を算出して表示用D1へ保存する。
  - Cloudflare APIが受信した商品URL、タイトル、個別価格は永続化せず、表示用D1には集計後の価格とスクリーンショット情報だけを保存する。
  - 検索結果の商品は、原則として全件を正常に抽出できることを前提とする。
  - 一部の商品だけを正常に抽出できない場合は一時的な通信異常として検索条件全体を再試行し、不完全な商品一覧から価格を算出しない。
  - 商品要素が存在するにもかかわらず全件を抽出できない場合は、サイト構造の変更などによるWorkflowの異常として扱う。
  - メルカリが「出品された商品がありません」と明示している場合は異常とせず、取得件数0件として正常終了する。
- 理由: ブラウザーの表示状態に依存する処理までGitHub Actionsで完了させ、Cloudflare Workersへ必要なデータだけを渡すため。

### 公式サイトからの取得内容

- 背景: 現行の公式サイトクローラーは、商品別の一覧ページからカードIDを取得し、カード詳細ページからカード名と画像を取得している。
- 採用内容:
  - 公式商品マスター更新、商品別カードID収集、カード詳細収集を別々の実行に分ける。
  - 公式商品マスター更新は、公式サイトの商品選択欄から商品コード、商品名、掲載順を取得し、Cloudflare APIへ送信する。
  - 商品別カードID収集は、1ページ目から総ページ数を取得し、各ページを1秒以上の間隔で順番に取得する。
  - ページごとに新しいWorkflowやジョブを再帰的に作成しない。
  - 全ページからカードIDを収集して重複を除外する。
  - 収集したカードIDをCloudflare APIへ送信し、Cloudflare Workersが表示用D1へ登録済みのカードIDを除外して、未登録カードIDを取得待ちとして保存する。
  - 一度発見したカードIDは削除せず、商品別カードID収集を再実行した場合は新しく発見したカードIDだけを追加する。
  - 商品別カードID収集の完了後、カード詳細収集を自動では開始しない。
  - 管理画面に未完了カード数を表示し、管理者が開始操作をしたときにカード詳細収集を新しい実行として起動する。
  - カード詳細収集は、実行開始時点で該当商品に残っている未完了カードをすべて対象として固定する。実行開始後に追加されたカードIDは次回の対象にする。
  - カード名は詳細ページの`h3.card-name`から取得し、商品名を表す`span.packname`は除外する。
  - カード画像は詳細ページの`.card-img img`要素をPNGで撮影し、`cards/{cardId}.png`としてR2へアップロードする。
  - 一覧ページおよび詳細ページ全体のスクリーンショットは保存しない。
  - カード情報とR2オブジェクトキーをCloudflare APIへ送信する。
  - 公式サイトへのアクセス間隔は1秒以上とし、詳細取得は直列に実行する。
- 理由: 一覧から取得対象を確定する処理と、未完了カードの詳細を収集する処理を分離し、再実行時に一覧取得を繰り返さず、残っているカードだけを処理できるようにするため。

### Workflowの分離

- 背景: メルカリは30分ごとの定期実行、公式サイトは管理画面からの商品同期・商品別取得であり、起動条件と処理内容が異なる。
- 採用内容:
  - 次の4つを別々のGitHub Actions Workflowにする。
    - メルカリ価格取得
    - 公式商品マスター更新
    - 商品別カードID収集
    - カード詳細収集
  - メルカリの取得周期は現行どおり30分ごととする。
  - メルカリ価格取得の実行中に次の定期実行時刻になった場合は、新しい実行を作成せず、その回をスキップする。実行中の処理は中止せず、次の定期実行時刻に改めて開始を試みる。
  - 4種類の処理は、それぞれ独立した実行として状態を管理する。
  - 公式サイトの取得は管理画面から開始し、状態表示と失敗時の再取得も管理画面から行う。
  - 公式サイトへの1秒以上のアクセス間隔と直列取得は各Workflow内で保証する。異なるWorkflowや別商品の実行を横断する排他制御は追加しない。
  - 環境構築など複数のWorkflowに共通する手順は、ローカルActionへ分離して再利用する。
- 理由: 処理ごとの責務と失敗箇所をGitHub Actions上で明確にし、ある処理の変更が別の処理へ与える影響を把握しやすくするため。

### 管理画面からの起動

- 背景: 商品別カードID収集とカード詳細収集を自動的に連鎖させると、保存成功後の起動失敗や二重起動を扱うための状態管理が増え、障害箇所も分かりにくくなる。
- 採用内容:
  - 商品別カードID収集とカード詳細収集は、管理画面上でも別の操作として扱う。
  - 管理者がボタンを押したときだけ、未完了カードを対象とするカード詳細収集を開始する。
  - 実行中の処理は管理画面に実行中と表示し、同じ処理の開始操作を無効にする。
  - API側でも同じ処理の二重開始を拒否する。
  - 管理画面には過去の実行履歴を表示せず、現在実行中または最新の状態だけを表示する。
  - メルカリ価格取得の状態は専用画面を作らず、既存の商品管理画面に現在実行中または最新の状態だけを表示する。
  - 失敗時だけ、最新のエラー内容を確認できるようにする。
- 理由: 管理者の操作は1回増えるが、Workflow同士の自動連鎖をなくし、問題が商品別カードID収集とカード詳細収集のどちらで発生したかを明確にするため。

### GitHubリポジトリの公開範囲とActions利用枠

- 背景: メルカリを30分間隔で実行すると月約1,440回となる。プライベートリポジトリでは、各ジョブの分単位の切り上げによりGitHub Freeの月間2,000分を超える可能性が高い。
- 採用内容:
  - リポジトリを公開する。
  - 公開リポジトリの標準GitHub-hosted runnerを使用する。
  - APIキー、R2認証情報、Repository Dispatch用tokenはGitHub Actions SecretsまたはCloudflare Workers Secretsだけに保存し、リポジトリへ含めない。
  - 外部からのPull Requestを契機として、クローラー用Secretsを使用するWorkflowは実行しない。
- 理由: 30分間隔とジョブ分割の要件を維持しながら、プライベートリポジトリの月間実行枠を避けられるため。

### GitHub Actionsの失敗分離単位

- 背景: 商品全体を1つの長いジョブで処理すると、後半で失敗するたびに全件を先頭から再実行することになり、処理が完了しない可能性がある。
- 採用内容:
  - 公式サイトのカード取得は、5〜10件程度のカードを1バッチとしてmatrixジョブへ分割する。
  - バッチ内の1件が失敗しても残りのカードは処理する。
  - 成功したカードはその都度R2とCloudflare APIへ保存する。
  - 再試行時はCloudflare側の完了状態を参照し、成功済みカードを対象から除外する。
- 理由: 失敗範囲を限定しながら、カード1件ごとにジョブを起動するオーバーヘッドも避けるため。

### GitHub Actions内での自動再試行

- 背景: 運用者がGitHub Actions画面を開いて失敗ジョブを手動再実行する運用は採用できない。
- 採用内容:
  - 1回のWorkflow内で、未完了の対象だけを最大3回まで試行する。
  - 最初のアクセスを1回目と数え、再試行は最大2回、合計最大3回とする。4回目は実行しない。
  - 再試行回数は有限とし、成功するまで無制限に実行しない。
  - matrixジョブは一部の失敗で他のジョブを中止しない構成にする。
- 理由: 一時的な通信障害からは自動復旧しつつ、DOM変更などの恒常的な失敗による無限実行を防ぐため。

### 3回失敗した後の扱い

- 背景: 規定回数の再試行後も失敗する場合は、同じ処理を繰り返しても回復しない可能性が高い。
- 採用内容:
  - 失敗した対象とエラー内容をCloudflare側へ保存する。
  - 管理画面に失敗状態を表示する。
  - 管理画面からの再実行は新しい実行として登録し、直前の実行で失敗した対象だけを引き継ぐ。
  - 新しい実行では試行回数を1回目から数え、合計最大3回まで試す。
  - 元の失敗履歴は上書きせず、新しい実行との関連を残す。
  - 運用者がGitHub Actions画面を開く必要はない。
  - メルカリの失敗対象は、次回の通常クロールでも再取得対象になる。
- 理由: 無限再試行を避けながら、アプリケーションの管理画面から復旧できるようにするため。

### 実行結果の判定

- 背景: 取得対象の一部失敗と、Workflowそのものの異常を同じ結果として扱うと、どこに問題があるかを判断しにくい。
- 採用内容:
  - 全対象に成功した場合は、GitHub Actionsを成功、アプリケーション上の実行状態を完了とする。
  - 一部の対象に成功し、一部が3回失敗した場合は、GitHub Actionsを成功、アプリケーション上の実行状態を一部失敗とする。
  - 全対象が失敗した場合は、GitHub Actionsを失敗、アプリケーション上の実行状態を失敗とする。
  - 認証、設定、API通信、結果保存、プログラムなど、Workflowを上から下まで正常に完了できない異常が発生した場合は、GitHub Actionsを失敗、アプリケーション上の実行状態を失敗とする。
- 理由: 取得できた結果は保存して活用しつつ、取得自体が成立しなかった場合やWorkflowの異常を成功として扱わないため。

### GitHub Actionsからの結果・異常報告

- 背景: 取得データと成功・失敗を別々のAPIで更新すると、片方だけ成功した場合にデータと状態が一致しなくなる。
- 採用内容:
  - クローラー専用APIは`/api/crawler`配下に置き、既存の利用者向けAPIとは別のBearer認証を適用する。
  - `GET /api/crawler/runs/{crawlRunId}`で、実行種別と固定済みの取得対象を返す。
  - `POST /api/crawler/runs/{crawlRunId}`で、対象ID、成功・失敗、成功時の取得データまたは失敗時の最新エラーをまとめて受け付ける。
  - Cloudflare Workersは、取得データの保存と対象状態の更新を同じトランザクションで行う。
  - 1つの対象を3回試しても取得できなかった場合は、`success: false`と最新のエラーを送信する。
    - 成功時は success: true
  - 同じ結果が再送されても、データや状態を重複させない。
  - 固定済みの全対象から結果を受信した時点で、Cloudflare Workersが完了、一部失敗、失敗を確定する。Workflow全体の完了を報告する別APIは設けない。
  - GitHub Actionsの強制終了などで結果を送信できない場合に備え、実行期限を過ぎても結果が揃わない実行はCloudflare Workers側で失敗へ変更する。
- 理由: 対象ごとの取得データと結果を不可分に保存し、別API間の不整合を作らずに実行状態を確定するため。

### Repository Dispatchで渡す値

- 背景: Repository Dispatchのpayloadへ取得対象をすべて含めると、payload上限への依存が生じ、再試行時の対象固定も難しくなる。
- 採用内容:
  - Cloudflare側でクロール実行を作成し、一意な`crawlRunId`を発行する。
  - Repository Dispatchでは`crawlRunId`だけをGitHub Actionsへ渡す。
  - GitHub Actionsはクローラー専用APIから、`crawlRunId`に対応する取得対象一覧を取得する。
- 理由: 実行開始時点の対象をCloudflare側で固定し、初回実行と再試行で同じ対象を参照できるため。

### Repository Dispatchの発行元と認証

- 背景: メルカリは定期実行、公式サイトは既存管理画面から起動する。どちらも表示用D1と管理画面を持つ`apps/www`に実行状態を集約できる。
- 採用内容:
  - 新しいdispatcher専用Workerは追加せず、`apps/www`のWorkerからRepository Dispatchを発行する。
  - メルカリの30分Cronも`apps/www`へ設定する。
  - 公式サイトの取得は、既存管理画面から`apps/www`を経由して起動する。
  - 対象リポジトリだけに限定したfine-grained personal access tokenをCloudflare Workers Secretへ保存する。
- 理由: 個人開発で専用サービスを増やさず、起動、実行状態、失敗時の再実行を既存アプリへ集約するため。

### GitHub ActionsからR2へのアップロード

- 背景: GitHub Actionsが取得したスクリーンショットとカード画像をR2へ保存する必要がある。署名付きURLの発行は今回の信頼境界に対して複雑すぎる。
- 採用内容:
  - 対象バケットだけへ書き込めるR2認証情報を作成する。
  - R2認証情報をGitHub Actions Secretsへ保存する。
  - GitHub ActionsからR2のS3互換APIへ直接アップロードする。
  - 認証情報の権限は必要最小限にする。
- 理由: 自分が管理するGitHub Actionsだけがアップロード元であり、専用のURL発行APIを追加せず単純に実装できるため。

### GitHub ActionsからCloudflare APIへの認証

- 背景: クローラー専用APIへの無関係なリクエストを拒否し、GitHub Actionsからのリクエストだけを受け付ける必要がある。
- 採用内容:
  - クローラー専用のAPIキーを発行する。
  - APIキーをGitHub Actions SecretsとCloudflare Workers Secretsへ保存する。
  - GitHub Actionsは`Authorization: Bearer <APIキー>`でクローラー専用APIへアクセスする。
  - 既存のCloudflare Accessによる利用者認証とは別の認証経路にする。
- 理由: 個人運用に必要な認証強度を満たし、OIDCやCloudflare Accessの機械認証を追加するより実装と運用が単純なため。

### 標準GitHub-hosted runnerからのメルカリ取得検証

- 背景: User-Agent、ブラウザーのlocale・timezone・言語設定、送信元IPの地域は別の要素であり、標準GitHub-hosted runnerでは日本の送信元IPを保証できない。
- 採用内容:
  - `ubuntu-24.04`の標準GitHub-hosted runnerと、日本からのローカル実行で同じ検索URLを検証した。
  - どちらもメルカリ検索ページへアクセスでき、商品要素とスクリーンショットを取得できた。
  - 日本からの実行は円価格で表示された。
  - 標準GitHub-hosted runnerでは「アメリカ合衆国」地域として認識され、地域選択画面と`US$`価格が表示された。
  - 地域選択画面で「日本」を選択しても、現行クローラーが使用する`.merPrice`は`US$`表示のままだった。
  - UAを日本ローカル環境と同じ値にし、`Accept-Language`、`navigator.language=ja`、timezone=`Asia/Tokyo`、東京のgeolocationを設定しても、地域判定は「アメリカ合衆国」、`.merPrice`は`US$`表示のままだった。
  - 一方、各商品の`.merItemThumbnail[role="img"]`にある`aria-label`には、元の日本円価格と変換後の米ドル価格が両方含まれていた。
  - 指定検索URLの全10商品から日本円価格を取得できた。
  - 取得した日本円価格で`.merPrice`を上書きし、地域案内を閉じてから撮影することで、日本円表示のスクリーンショットを取得できた。
  - 日本向けのUA、locale、timezone、geolocation、日本IPは設定せず、標準GitHub-hosted runnerを採用する。
- 理由: 初期状態の標準runnerでも正しい日本円価格を取得でき、データ取得とスクリーンショット表示の両方を日本向けに補正できることを実測したため。
- 検証記録:
  - [Issue #3](https://github.com/Suntory-N-Water/dm-price-tracker/issues/3)
  - [成功したアクセス・撮影Workflow](https://github.com/Suntory-N-Water/dm-price-tracker/actions/runs/30185696378)
  - [日本地域選択後の価格検証Workflow](https://github.com/Suntory-N-Water/dm-price-tracker/actions/runs/30185908716)
  - [Chromiumを日本環境へ設定した価格検証Workflow](https://github.com/Suntory-N-Water/dm-price-tracker/actions/runs/30186135412)
  - [初期状態で円価格を取得し、表示を円へ置換したWorkflow](https://github.com/Suntory-N-Water/dm-price-tracker/actions/runs/30186568694)

### 既存Cloudflareクローラー基盤の扱い

- 背景: 本システムは開発中であり、旧基盤との並行稼働や移行期間は不要である。新方式では、Cloudflare Workflows上でジョブ状態とレコードを管理する必要もなくなる。
- 採用内容:
  - 新方式の実装時に、次を直接置き換えて削除する。
    - `apps/mercari-crawler`
    - `apps/duel-masters-official-crawler`
    - `packages/cf-crawler-core`
    - クローラー専用D1、Browser binding、Workflow binding、公式クローラーへのService Binding
    - 旧クローラー専用の開発・デプロイ・DB操作スクリプト、生成型参照、依存パッケージ
  - 旧クローラーとの並行稼働、二重保存対策、段階的な切り替え、データ移行は行わない。
  - 表示用D1のマイグレーションは、旧アプリ削除時に`packages/display-db`へ所有を移す。
  - 表示用D1、カード画像とスクリーンショットのR2バケット、画像配信API、管理画面は残す。
  - 価格集計、メルカリの無限スクロール・仮想化DOM対応、公式サイトのDOM抽出仕様は、新しい責務の配置先へ移して挙動を維持する。
- 理由: 不要な移行工程を設けず、必要な業務ロジックと表示データだけを残して旧クローラー基盤を廃棄するため。

## 方針決定に必要な事項

現時点で、採用方式を決めるために未解決の事項はない。

## 調査済みの制約

- Repository Dispatchでは、Workflowファイルがデフォルトブランチに存在する必要がある。
- Repository Dispatchの`client_payload`は、トップレベル10項目、JSON全体64KB未満である。
- GitHub-hosted runnerの1ジョブの実行上限は6時間である。
- 1回のWorkflow runで生成できるmatrixジョブは最大256件である。
- GitHub Freeのプライベートリポジトリ向け2,000分は、1リポジトリ単位ではなくアカウント単位の月間枠である。
- 標準GitHub-hosted runnerを使う公開リポジトリでは、GitHub Actionsの実行時間は無料である。
- matrixの`fail-fast`はデフォルトで有効なため、一部失敗後も他の取得を続ける場合は無効化する必要がある。
- 先行ジョブのoutputから、後続ジョブのmatrixを生成できる。
- Workflow Artifactを使ってジョブ間で結果ファイルを共有できる。
- GitHub Actionsは失敗ジョブまたは特定ジョブを再実行できるが、今回の運用ではGitHub Actions画面からの手動操作に依存しない。
- Cloudflare Cron Triggerの実行地域は固定されず、空き容量のあるマシンで実行される。
- Cloudflare Browser RunではUser-Agentを変更できるが、送信元IPの地域とは別の設定である。

## 参考資料

- [GitHub Actions: Running variations of jobs in a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations)
- [GitHub Actions: Re-running workflows and jobs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)
- [GitHub Actions: Store and share data with workflow artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data)
- [GitHub Actions limits](https://docs.github.com/en/actions/reference/limits)
- [GitHub REST API: Create a repository dispatch event](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event)
- [Cloudflare Browser Run: Playwright](https://developers.cloudflare.com/browser-run/playwright/)
- [Cloudflare Browser Run limits](https://developers.cloudflare.com/browser-run/limits/)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare R2 S3 API](https://developers.cloudflare.com/r2/get-started/s3/)
