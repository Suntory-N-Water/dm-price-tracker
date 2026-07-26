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
- 理由: ブラウザーの表示状態に依存する処理までGitHub Actionsで完了させ、Cloudflare Workersへ必要なデータだけを渡すため。

### 公式サイトからの取得内容

- 背景: 現行の公式サイトクローラーは、商品別の一覧ページからカードIDを取得し、カード詳細ページからカード名と画像を取得している。
- 採用内容:
  - 1つの一覧取得ジョブ内で1ページ目から総ページ数を取得し、各ページを1秒以上の間隔で順番に取得する。
  - ページごとに新しいWorkflowやジョブを再帰的に作成しない。
  - 全ページからカードIDを収集して重複を除外する。
  - 表示用D1へ登録済みのカードIDを除外し、未登録カードの詳細をGitHub Actionsで取得する。
  - カード名は詳細ページの`h3.card-name`から取得し、商品名を表す`span.packname`は除外する。
  - カード画像は詳細ページの`.card-img img`要素をPNGで撮影し、`cards/{cardId}.png`としてR2へアップロードする。
  - 一覧ページおよび詳細ページ全体のスクリーンショットは保存しない。
  - カード情報とR2オブジェクトキーをCloudflare APIへ送信する。
  - 公式サイトへのアクセス間隔は1秒以上とし、詳細取得は直列に実行する。
- 理由: 公式サイトのブラウザー処理と画像取得も、メルカリと同じ実行基盤へ集約するため。

### Workflowの分離

- 背景: メルカリは30分ごとの定期実行、公式サイトは管理画面からの商品同期・商品別取得であり、起動条件と処理内容が異なる。
- 採用内容:
  - メルカリと公式サイトは別のGitHub Actions Workflowにする。
  - メルカリの取得周期は現行どおり30分ごととする。
  - 公式サイトの商品同期・商品別取得・状態表示・失敗時の再取得という既存の管理画面機能は残し、呼び出し先だけを新方式へ置き換える。
- 理由: 異なるトリガーと実行制約を1つのWorkflowへ混在させる必要がないため。

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
  - 1回のWorkflow内で、未完了の対象だけを最大3回まで自動再試行する。
  - 再試行回数は有限とし、成功するまで無制限に実行しない。
  - matrixジョブは一部の失敗で他のジョブを中止しない構成にする。
- 理由: 一時的な通信障害からは自動復旧しつつ、DOM変更などの恒常的な失敗による無限実行を防ぐため。

### 3回失敗した後の扱い

- 背景: 規定回数の再試行後も失敗する場合は、同じ処理を繰り返しても回復しない可能性が高い。
- 採用内容:
  - 失敗した対象とエラー内容をCloudflare側へ保存する。
  - 管理画面に失敗状態を表示する。
  - 管理画面から、失敗対象だけを新しいGitHub Actions Workflowへ送って再実行できるようにする。
  - 運用者がGitHub Actions画面を開く必要はない。
  - メルカリの失敗対象は、次回の通常クロールでも再取得対象になる。
- 理由: 無限再試行を避けながら、アプリケーションの管理画面から復旧できるようにするため。

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
  - したがって、標準GitHub-hosted runnerをそのままメルカリ取得へ使用しない。
- 理由: アクセス可否だけでなく、現行の価格抽出とスクリーンショットが日本向け要件を満たさないことを実測で確認したため。
- 検証記録:
  - [Issue #3](https://github.com/Suntory-N-Water/dm-price-tracker/issues/3)
  - [成功したアクセス・撮影Workflow](https://github.com/Suntory-N-Water/dm-price-tracker/actions/runs/30185696378)
  - [日本地域選択後の価格検証Workflow](https://github.com/Suntory-N-Water/dm-price-tracker/actions/runs/30185908716)

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

ここにある事項だけを、方式の最終決定前に解消する。これら以外は実装を開始するための前提条件にしない。

### メルカリへ日本向けにアクセスする実行経路

- 標準GitHub-hosted runnerから日本の送信元IPを利用する方法を採用するか、日本リージョンのrunnerへ切り替えるかを決める。
- 米国向け表示のままDOM内の円価格だけを抽出する方法は、スクリーンショットが米国向けになるため採用しない。

## 実装時に決める事項

次の事項は方式選定を止めない。既存挙動、実測値、GitHub Actionsの標準機能に沿って実装時に決める。

### Workflow構成

- 準備、取得、最大3回の再試行、結果集約のジョブ構成。
- メルカリの同一ジョブ内で処理する検索条件数。
- `fail-fast`、`concurrency`、タイムアウトの具体値。
- ジョブ間で受け渡すoutputとArtifact。

### 取得処理

- メルカリの検索条件を1ジョブずつ処理するか、複数件をまとめるか。
- 公式カードのバッチサイズを5〜10件の範囲で何件にするか。
- メルカリのスクリーンショット撮影方法と、画像未表示への対応。

### APIと状態管理

- クローラー専用APIのパス、Valibotスキーマ、リクエスト・レスポンス形式。
- `crawlRunId`、対象ID、試行回数による冪等性の実装。
- 実行状態、部分成功、個別エラーのDB表現。
- 失敗状態と個別エラーを既存管理画面へ表示する具体的なUI。
- 既存の利用者向けCloudflare Access認証と、クローラー専用Bearer認証を分離する具体的なルート構成。

### 認証情報とR2

- APIキーとR2書き込みキーのローテーション方法。
- メルカリのスクリーンショット用R2オブジェクトキーと、孤児オブジェクトの扱い。

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
