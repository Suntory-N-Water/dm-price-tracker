# Cloudflare Webクローラー 要件定義書

## 概要

Cloudflare Workflows上でクローラーを実行し、共通処理を`cf-crawler-core`、サイト固有処理を各クローラーに分離する。

pnpm monorepoで構築し、Job管理用DBはクローラーごとに分ける。クローラー固有の要件に応じて、複数Workerで共有する表示用DB等を追加できる。

---

## システム構成

```
packages/
  cf-crawler-core/       # クロール基盤(メインロジック)
    src/
      schema.ts          # Drizzle ORMスキーマ定義(共通)
    test/
      unit/
      integration/
    vitest.config.ts

apps/
  xxx-crawler/           # クローラー個別実装
    migrations/          # drizzle-kit generateで生成
    drizzle.config.ts    # DB接続情報
    wrangler.jsonc
  yyy-crawler/           # 別サイト用クローラー(同様の構造)
  admin/                 # 管理画面(未着手)
```

---

## アーキテクチャ

### 採用技術

| 役割 | 技術 |
|---|---|
| 実行基盤 | Cloudflare Workflows |
| DB | Cloudflare D1(Job管理用DBはクローラーごと、追加DBはアプリ固有) |
| ORM | Drizzle ORM |
| バリデーション | Valibot |
| テスト | Vitest(`cf-crawler-core`の統合テストは`@cloudflare/vitest-pool-workers`を使用) |
| パッケージ管理 | pnpm workspaces |

### Cloudflare Workflowsを選んだ理由

- ステップ単位の自動リトライ
- 長時間実行が可能(ステップをまたいでCPU制限がリセットされる)
- `step.sleep()`による全Job完了のポーリング(sleepはステップ数に含まれない)
- `instance.status()`による子Workflowインスタンスの状態取得

### トリガー方法

起動経路はクローラー固有とする。`minimal-crawler`・`city-heaven-crawler`はHTTPエンドポイント、`mercari-crawler`は30分ごとのCron Triggerを使用する。将来、管理画面から起動するクローラーにはService Bindingを使用する。

Workflow REST APIを起動経路として選ぶ場合の例:

```bash
curl -X POST https://api.cloudflare.com/client/v4/accounts/{account_id}/workflows/{workflow_name}/instances \
  -H "Authorization: Bearer {token}" \
  -d '{ "params": { "url": "https://...", "girlId": "47977232" } }'
```

---

## クロールフロー

```
HTTP・Cron Trigger・Service Binding等からWorkflowをトリガー
  ↓
initializer()
  - Executeを作成(status: WAITING → RUNNING)
  - 通常は起点Jobを1件以上作成(status: WAITING)
  - 起点Jobが0件の場合は空実行として扱い、ExecuteをFINISHEDにして終了
  ↓
worker() ループ開始
  - JobをRUNNINGに更新
  - kindでswitch分岐して処理
  - createJobs() or createRecords() をreturnするだけ
  - cf-crawler-coreが内部でD1登録・ステータス更新を行う
  ↓
チャンク処理(CHUNK_SIZE件ずつ並列実行)
  - 1チャンク分のJobが全てFINISHED or ABORTEDになったら次のチャンクへ
  ↓
ポーリング(POLLING_INTERVAL秒ごと)
  - 全JobがFINISHED or ABORTEDになったらExecuteをFINISHEDに更新して終了
  ↓
afterFinish()
  - Execute完了後にクローラー固有の集計・外部DB書き込み等を実行
  - デフォルト実装は何もしない
```

### kindの考え方

クローラーの階層構造をそのままkindで表現する。LIST/DETAILに限らず自由に定義する。

```
例：ECサイト
LIST → CATEGORY → SUBCATEGORY → SUBCATEGORY_LIST → DETAIL
```

---

## D1スキーマ

### Execute(実行全体の管理)

```sql
id          TEXT PRIMARY KEY   -- uuid
status      TEXT               -- WAITING / RUNNING / FINISHED / ABORTED
started_at  TEXT
created_at  TEXT
updated_at  TEXT
```

### Job(個々のURL処理)

```sql
id             TEXT PRIMARY KEY   -- uuid
execute_id     TEXT NOT NULL      -- Executeへの紐付け
parent_job_id  TEXT               -- 親JobのID(起点Jobはnull)
kind           TEXT               -- LIST / DETAIL など自由定義
status         TEXT               -- WAITING / RUNNING / FINISHED / ABORTED
url            TEXT
meta           TEXT               -- JSON。親Jobのmetaを引き継ぎ、上書き可能
result_count   INTEGER            -- 生成した子Jobまたはレコードの件数
result_error   TEXT               -- ABORTEDのときのエラーメッセージ
started_at     TEXT               -- RUNNINGになった日時
crawled_at     TEXT               -- FINISHEDになった日時
created_at     TEXT
updated_at     TEXT

UNIQUE(execute_id, url)           -- 同一Execute内での重複クロール防止
```

### Record(クロールで取得した実データ)

```sql
id          TEXT PRIMARY KEY   -- uuid
job_id      TEXT NOT NULL
url         TEXT               -- クロール元URL
meta        TEXT               -- JSON。親Jobのmetaを引き継ぎ
data        TEXT               -- JSON。実際のクロールデータ
started_at  TEXT
crawled_at  TEXT
created_at  TEXT
updated_at  TEXT
```

### ステータス遷移

```
WAITING → RUNNING → FINISHED
                  ↘ ABORTED(リトライ上限超え or 例外)
```

---

## wrangler.jsonc規則

各クローラーは、cf-crawler-coreが参照するバインディング名を統一する。取得先や外部サービスに固有のバインディングは、利用するクローラーの`wrangler.jsonc`に追加し、cf-crawler-coreの必須バインディングには含めない。

```jsonc
{
  "workflows": [
    {
      "name": "xxx-orchestrator",
      "binding": "ORCHESTRATOR",    // 固定。OrchestratorServiceがこの名前で参照する
      "class_name": "XxxOrchestrator"
    },
    {
      "name": "xxx-job",
      "binding": "JOB_WORKFLOW",    // 固定。OrchestratorServiceがcreateBatch時に使用
      "class_name": "XxxJob"
    }
  ],
  "d1_databases": [
    {
      "binding": "DB",              // 固定。cf-crawler-coreがこの名前で参照する
      "database_name": "xxx-crawler",
      "database_id": "<DATABASE_ID>"
    }
  ],
  "vars": {
    "CHUNK_SIZE": 10,
    "RETRY_LIMIT": 3,
    "POLLING_INTERVAL": "5 seconds"
  }
}
```

---

## cf-crawler-coreの設計

### ファイル構成

```
cf-crawler-core/
  src/
    crawler/
      createExecute.ts   # Executeインスタンス生成
      createJobs.ts      # Jobインスタンス配列生成(起点・子Job共通)
      createRecords.ts   # Recordインスタンス配列生成
    lib/
      db.ts              # Drizzle ORMのDB生成
      schema.ts          # Drizzle ORMスキーマ定義
      repository.ts      # D1への読み書き
      serialization.ts   # metaのJSON変換
    operations/
      BaseOrchestrator.ts   # WorkflowEntrypointを継承。Executeの管理・チャンク・ポーリング
      BaseJob.ts            # WorkflowEntrypointを継承。個々のJob処理
      OrchestratorService.ts # Orchestratorの処理ロジック
      JobService.ts          # Jobの処理ロジック
  test/
    unit/                # Serviceのユニットテスト(step・DB・envをモック)
    integration/         # D1・Workflowsを使ったインテグレーションテスト
  vitest.config.ts
```

### 責務の分離

`BaseOrchestrator`はオーケストレーションを担う。

```typescript
export abstract class BaseOrchestrator extends WorkflowEntrypoint {
  async run(event, step) {
    const db = createCrawlerDatabase(this.env.DB)
    const service = new OrchestratorService(this.env, step, db)
    const { execute } = await service.initialize(event.payload, this.initializer.bind(this))
    await service.processJobs(execute)
    await service.finish(execute)
    await step.do('after finish hook', () => this.afterFinish(execute, db))
  }

  abstract initializer(params): Promise<{ execute: Execute; jobs: Job[] }>
  afterFinish(execute, db) {}
}
```

`BaseJob`は個々のJob処理を担う。

```typescript
export abstract class BaseJob extends WorkflowEntrypoint {
  async run(event, step) {
    const service = new JobService(this.env, step, drizzle(this.env.DB))
    await service.process(event.payload.jobId, this.worker.bind(this))
  }

  abstract worker(job): Promise<ReturnType<typeof createJobs> | ReturnType<typeof createRecords>>
}
```

`OrchestratorService`は実行全体を管理する。

| メソッド | 役割 |
|---|---|
| `initialize(params, initializer)` | Execute・起点JobをD1に登録 |
| `processJobs(execute)` | WAITINGのJobを取得してチャンク処理・createBatch |
| `pollUntilComplete(chunk)` | 全件FINISHED or ABORTEDまでポーリング |
| `finish(execute)` | ExecuteをFINISHEDに更新 |

`JobService`は個々のJobを管理する。

| メソッド | 役割 |
|---|---|
| `process(jobId, worker)` | D1からJobを取得・workerを呼ぶ・結果をD1に登録 |

### クローラー固有の依存関係

取得処理と外部サービスへの依存はxxx-crawlerに閉じ込め、cf-crawler-coreはJob管理に限定する。

- HTTP取得方法とサイト固有の解析処理はxxx-crawlerに実装する
- 外部サービスのパッケージとバインディングは、利用するxxx-crawlerに配置する
- `BaseJob`は`CrawlerEnv`を満たすクローラー固有のEnv型を受け取り、追加バインディングを型安全に参照する
- 外部サービスの同時実行数とレート制限を、xxx-crawlerの`CHUNK_SIZE`とリトライ方針に反映する

### cf-crawler-coreが提供する関数

| 関数 | 役割 |
|---|---|
| `createExecute()` | Executeインスタンスを生成(DB登録はOrchestratorServiceが行う) |
| `createJobs([{ url, kind, meta? }])` | Jobインスタンスの配列を生成(起点・子Job共通) |
| `createRecords([{ url, data, meta? }])` | Recordインスタンスの配列を生成 |

> `createJob`と`createJobs`は分ける理由がないため`createJobs`に統一。`new CrawlJob()`を生成するクラスパターンはCloudflareの`this.env`で環境変数が統一管理されるため不要。

### cf-crawler-coreが内部で行うこと

- D1へのExecute・Job・Record登録
- Jobのステータス管理(WAITING→RUNNING→FINISHED/ABORTED)
- `started_at`はRUNNINGになったタイミングで自動更新
- `crawled_at`はD1登録が全部成功してFINISHEDになったタイミングで自動更新(トランザクション)
- `result_count`の自動更新(createJobs/createRecordsのreturn後に内部でカウント)
- `meta`の親Jobからの自動引き継ぎ・マージ(子Job指定のmetaで上書き)
- チャンク処理(CHUNK_SIZE件ずつcreateBatch)
- 全Job完了のポーリング(POLLING_INTERVAL間隔、step.sleepを使用)
- エラーハンドリング(xxx-crawlerでthrowしたエラーをキャッチしてABORTED処理)
- リトライ(Workflowsネイティブのstep.doのretriesに委譲、RETRY_LIMIT環境変数を使用)
- リトライ中のJobはRUNNINGのまま扱い、最終成功でFINISHED、上限超えでABORTED
- 子Job Workflowがerroredまたはterminatedになった場合は、Orchestratorが対象JobをABORTEDに更新して後続処理を継続
- ExecuteのFINISHED更新(全JobがFINISHED or ABORTEDになったとき)
- Execute完了後の`afterFinish()`呼び出し(デフォルトは空実装)

### metaの型・バリデーション・パースの方針

- cf-crawler-coreはmetaの中身を関知しない。`Record<string, unknown>`として受け取り`JSON.stringify()`してD1に保存するだけ
- metaのバリデーションはxxx-crawler側の責務。`createJobs()`に渡す前に保証する
- worker()でD1から取得したjob.metaはJSON文字列なので、xxx-crawler側でパースして型をつける
- ジェネリクスは不要

### xxx-crawlerの実装

```typescript
// Paramsスキーマ(起動元から渡す値がある場合、xxx-crawler側で定義・バリデーション)
const ParamsSchema = v.object({
  url: v.string(),
})

// Metaスキーマ(Job間で引き継ぎたい値、xxx-crawler側で定義・パース)
const MetaSchema = v.object({
  girlId: v.string(),
})

// 起点：Executeと起点Jobを作ってOrchestratorに渡すだけ
export class XxxOrchestrator extends BaseOrchestrator {
  async initializer(params: v.InferOutput<typeof ParamsSchema>) {
    return {
      execute: createExecute(),
      jobs: createJobs([{ url: params.url, kind: 'LIST' }])
    }
  }
}

// 個々のJob処理：kindでswitch分岐してcreateJobs or createRecordsを返すだけ
export class XxxJob extends BaseJob {
  async worker(job) {
    const meta = v.parse(MetaSchema, JSON.parse(job.meta))

    switch (job.kind) {
      case 'LIST':
        const { urls, girlId } = await fetchUrls(job.url)
        return createJobs(urls.map(url => ({ url, kind: 'DETAIL', meta: { girlId } })))

      case 'DETAIL':
        const data = await fetchData(job.url, meta.girlId)
        return createRecords([{ url: job.url, data }])
    }
  }
}
```

### エラーハンドリングの方針

cf-crawler-coreはJobの失敗を管理し、xxx-crawlerはサイト固有の例外処理と外部リソースの解放を担う。

- cf-crawler-coreは未処理の例外を捕捉し、JobをABORTEDに更新する
- xxx-crawlerは個別処理が必要な例外だけを捕捉し、それ以外はcoreへ伝播させる
- xxx-crawlerはJob内で生成した接続やセッションを、成功・失敗にかかわらず解放する

```typescript
case 'LIST':
  try {
    const urls = await fetchUrls(job.url)
    return createJobs(urls.map(url => ({ url, kind: 'DETAIL' })))
  } catch (e) {
    if (e instanceof SpecificError) {
      // 無視するなど個別対応
    }
    throw e  // それ以外はcoreに任せる
  }
```

---

## マイグレーション運用ルール

- Job管理用スキーマは`packages/cf-crawler-core/src/lib/schema.ts`で一元管理する
- 各クローラーの`drizzle.config.ts`がcoreのJob管理用スキーマを参照する
- 表示用DB等の追加DBは、所有するアプリ内にスキーマとDrizzle設定を分けて置く
- Job管理用スキーマ変更時は各クローラーで以下を実行する

```bash
pnpm run db:generate  # マイグレーションファイル生成
pnpm run db:migrate   # ローカルD1に適用
```

---

## 注意事項・制約

- Jobは`execute_id`で分離されるため、複数Executeが存在しても各Workflowは自分のJobだけを処理する
- 起点JobのURLは同一Execute内で一意にする。子Jobは`UNIQUE(execute_id, url)`と`ON CONFLICT DO NOTHING`により重複クロールをスキップする
- チャンク内の1JobがABORTEDになっても他のJobは続行する
- チャンクの次に進む条件：全件がFINISHED or ABORTEDになること
- Executeの完了判定：`status NOT IN ('FINISHED', 'ABORTED')`のJob件数が0になったとき
- リトライはWorkflowsのstep.doに委譲(RETRY_LIMIT環境変数で設定)
- リトライ中はRUNNINGのまま、上限超えでABORTED
- xxx-crawlerでエラーをキャッチしたい場合はthrowすればcoreが拾う
