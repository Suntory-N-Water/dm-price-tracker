Next.jsのApp Routerは、“設計力が試されるフレームワーク”です。  
Server Components、Server Actions、そして“use client”による明確な境界。  
それらは間違いなく強力な仕組みであり、  
使いこなせば、アプリケーションの構造を根本から変えるほどのポテンシャルを持っています。

ただ、どう設計すれば破綻しないのかについては、  
誰も明確な指針を示してくれません。

実際、僕自身もいくつものチーム開発でApp Routerを使いながら、  
「境界があいまいになる」「Server Actionsが散らかる」  
といった“App Router地獄”を何度も経験しました。

そこで、実際のプロダクション環境で戦いながら確立した構成を  
この記事で公開します。  
「App Routerをどう設計すれば、チーム開発が破綻しないか」

その答えを現場視点でまとめた、ひとつのプレイブックです。

## サンプルアプリ：「申請・承認システム」

この記事で紹介する構成は、ブログのような小さなデモではありません。  
実際にApp Routerの限界を試せる業務アプリで検証しました。

| ロール                 | 役割                                                 |
| ---------------------- | ---------------------------------------------------- |
| Requester(申請者)      | 申請の作成・編集・提出、ステータス確認、通知の受信   |
| Approver（承認者）     | 保留中の申請を確認、コメント付き承認／却下、履歴参照 |
| Everyone（全ユーザー） | プロフィール変更、メール変更、パスワードリセット     |

内部的には Google Identity Platform + NextAuth による認証、  
マルチロール制御、通知、DTO検証などを組み込み、  
App Router特有の問題が浮き彫りになるような構成になっています。

📂 リポジトリ:<iframe src="https://embed.zenn.studio/card#zenn-embedded__b931c1381e6d4" frameborder="0" height="121.109375"></iframe>

- System guide: [docs/README.md](https://github.com/YukiOnishi1129/next-app-router-architecture/tree/main/docs)
- Frontend playbook: [frontend/docs/README.md](https://github.com/YukiOnishi1129/next-app-router-architecture/tree/main/frontend/docs)
- Checklists: [docs/checklists.md](https://github.com/YukiOnishi1129/next-app-router-architecture/blob/main/docs/checklists.md)

## App Routerの“自由さ”をどう設計で制御するか

実際に運用して分かった課題は、大きく3つです。

#### 1\. 境界のあいまいさ

server専用コード（handlerやrepositoryなど）がclientコンポーネント側に漏れる。

#### 2\. Server Actionのスパゲッティ化

Actionがランダムなpage.tsxに散らばり、  
機能とルートが密結合する。

#### 3\. ハイドレーションの崩壊

どこかで "use client" を付け忘れると、  
レイアウト全体がクライアントレンダリングに変わる。

これらを防ぐには、  
「何をどこに置くか」を明確に定義し、  
それをLintで強制する仕組みが必要だと感じました。

そこで僕は、  
「ここに置く、そこには置かない、違反したらLintで弾く」  
そんなルールをコード化しました。

## 原則1：意図をもってレイヤーを分ける

App Routerを安全に使うための基本は「責務を明確に分けること」です。  
フォルダ構成は以下のように設計しました。

```
frontend/src/
├─ app/           # App Router: ルート・レイアウト・メタデータ（薄く保つ）
├─ features/      # ドメインごとの機能群（auth, requests, approvals, settings）
├─ shared/        # 共通UI・レイアウト・providerなど
└─ external/      # サーバーアダプタ層（dto, handler, service, repository, client）
```

### app/ は薄く保つ

```
// frontend/src/app/requests/[requestId]/page.tsx
import { RequestDetailPageTemplate } from '@/features/requests/components/server/RequestDetailPageTemplate'
import type { PageProps } from '@/shared/types/next'

export default async function RequestDetailPage(
  props: PageProps<'/requests/[requestId]'>
) {
  const { requestId } = await props.params
  const searchParams = await props.searchParams
  const highlight =
    Array.isArray(searchParams.highlight) ? searchParams.highlight[0] : searchParams.highlight

  return (
    <RequestDetailPageTemplate
      requestId={requestId}
      highlightCommentId={highlight}
    />
  )
}
```

ページ内ではデータフェッチを行わず、  
型付きパラメータを Feature 層のテンプレートへ渡すだけ。  
これを全ページで徹底します。

### features/ はドメインごとの「司令塔」

features/ ディレクトリは、アプリの各機能を“ドメイン単位”で束ねる場所です。  
「画面」や「ページ」ではなく、“機能のまとまり”として分けるのがポイント。

```
features/requests/
├─ components/
│  ├─ server/    # Server Components（ページテンプレート）
│  └─ client/    # Container / Presenter / Hook層
├─ hooks/        # TanStack Query + クライアントロジック
├─ queries/      # クエリキー + DTOヘルパー
├─ actions/      # Server Actions（薄いラッパー）
└─ types/        # 型定義・Enumなど
```

たとえば requests 機能では、  
申請一覧・詳細・承認処理などを1つのドメインとして構成します。

### Client層は意図的に“小さく保つ”

Reactのコンポーネント構造も、明確な責務分離を意識しています。

```
components/client/RequestList/
├─ RequestListContainer.tsx   # Hookを呼び出し、PropsをPresenterへ渡す
├─ RequestListPresenter.tsx   # 純粋な描画ロジック(JSXのみ)
├─ useRequestList.ts          # TanStack Query＋ローカル状態管理
├─ RequestList.test.tsx       # コンポーネント単位のテスト
└─ index.ts                   # バレルエクスポート
```

Containerは「データを集める係」、Presenterは「UIを描く係」。  
HooksはTanStack Queryを使って、Server ActionsやAPIからデータを取得します。

コンポーネントは小さく、役割は狭く。  
大きな関数にせず、テストも隣に置く。これが保守性を最大化する鍵です。

### external/ は「外界との接続口」

アプリが外部世界（DB・API・他サービス）とやり取りする場所が external/。  
「I/Oをすべてここで完結させる」ルールにしています。

```
external/
├─ dto/           # Zodスキーマ＋TypeScript型
├─ handler/       # Server ActionやServer Componentから呼ばれる入口
├─ service/       # ドメインサービス（ビジネスロジック）
├─ repository/    # DBアクセス（Drizzleなど）
└─ client/        # 外部APIクライアント
```

特徴的なのは、features層が直接repositoryやserviceをimportしないこと。  
代わりに、handler が「入口」として中継します。

これにより、バックエンドを差し替えてもReactコードに一切手を入れずに済みます。

たとえば、  
最初は Next.js + Drizzle で構築していたとしても、  
後から Go製のマイクロサービスに移行する時は、  
external/service/\*\* の実装を差し替えるだけでOKです。

この構造は「Next.jsモノリス」から「Next.js + Goバックエンド」への橋渡しを、  
リファクタリングなしで実現するための仕掛けです。

### Lintで設計品質を“自動で守る”

「人が守るルール」は、忙しいとすぐ崩壊します。  
そこで、アーキテクチャ上の禁則をESLintのカスタムルールでコード化しました。

```
frontend/eslint-local-rules/
├─ restrict-service-imports.js     # service層を直接import禁止（handlerのみ許可）
├─ restrict-action-imports.js      # *.action.ts は client/hooks からのみ利用可能
└─ use-nextjs-helpers.js           # PageProps/LayoutProps の統一／next/navigation利用チェック
```

これらのLintルールはCI上でも実行され、  
もし誰かが設計を壊すimportをしたら即ビルドが落ちます。

設計を“文化”ではなく“仕組み”で守る。  
これがプロダクション環境を安定させる一番の近道です。

## 原則2：ルーティングとレイアウトが体験を決める

App Routerでは、ルート構造そのものがUXの設計になります。  
「どの状態のユーザーに、どのレイアウトを見せるか」  
それをフォルダ構成で表現するのがポイントです。

### 認証状態ごとにルートを分離する

ルートグループは、ユーザーの状態に応じて3つに分けます。

| グループ          | 対応する状態     | 主なページ例                         |
| ----------------- | ---------------- | ------------------------------------ |
| `(guest)`         | 未ログイン       | ログイン、サインアップ、メール変更   |
| `(authenticated)` | ログイン済み     | ダッシュボード、申請、承認、設定など |
| `(neutral)`       | 中立（誰でも可） | パスワードリセット、利用規約など     |

これにより、\*\*「どの認証状態でアクセスできるか」\*\*を  
ルート構成そのものが語るようになります。

### Layoutコンポーネントが体験を制御する

各ルートグループには、その状態専用のレイアウトを用意します。  
たとえばログイン済みのユーザーだけが見る (authenticated) グループでは、  
共通ナビゲーションやサイドバーを含んだレイアウトを使います。

```
// frontend/src/app/(authenticated)/layout.tsx
import { AuthenticatedLayoutWrapper } from '@/shared/components/layout/server/AuthenticatedLayoutWrapper'
import type { LayoutProps } from '@/shared/types/next'

export const dynamic = 'force-dynamic'

export default function AuthenticatedLayout(props: LayoutProps<'/'>) {
  return <AuthenticatedLayoutWrapper>{props.children}</AuthenticatedLayoutWrapper>
}
```

AuthenticatedLayoutWrapper

```
//frontend/src/shared/components/layout/server/AuthenticatedLayoutWrapper
export async function AuthenticatedLayoutWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAuthServer()

  const queryClient = getQueryClient()

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="bg-background text-foreground flex min-h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <Header />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </HydrationBoundary>
  )
}
```

この AuthenticatedLayoutWrapper が担う責務は以下の3つです：

1. requireAuthServer() による認証チェック
2. 共通UI（ヘッダー・サイドバー）の描画

つまり、「アクセス制御とデータハイドレーション、UI統一」の要がこのレイアウトに詰まっています。

### metadataは「レイアウト側」に集約する

ページ単位ではなく、レイアウト単位でメタ情報を定義します。  
こうすることで、階層ごとにタイトルや説明を継承でき、  
SEOにもメンテナンス性にも優れた構造になります。

```
// frontend/src/app/(authenticated)/requests/layout.tsx
export const metadata = {
  title: 'Request List | Request & Approval System',
  description: 'Browse, filter, and search submitted requests.',
}
```

### 新しいルートを追加するときのチェックリスト

実際に新規画面を追加する際は、  
次の手順に沿えば“破綻しないルーティング”を維持できます。

1. 適切なルートグループ（例：(authenticated)）を選ぶ
2. layout.tsx と page.tsx を作成する
3. LayoutProps<'/path'> を利用し、レイアウトから metadata をexport
4. PageProps を使い、props.params / props.searchParams を await で受け取る
5. 実際の描画は features/◯◯/components/server/ 配下のテンプレートに委譲する
6. ローディングやエラーハンドリングが必要なら loading.tsx / error.tsx を用意する
7. pnpm typegen を実行して型付きルートを再生成する

このチェックリストをチームで共有しておけば、  
「誰が作っても構造が崩れないNext.jsプロジェクト」が実現できます。

## 原則3：Server-firstなデータフェッチ戦略（TanStack Query編）

App Routerの強みは、サーバーとクライアントの境界が明確な点にあります。  
しかし、その分「どこでデータを取るか？」「キャッシュは誰が持つのか？」が混乱しがち。

そこで僕は、TanStack Queryをサーバー／クライアント両方で活用する構成を採用しました。  
「サーバーでキャッシュを作り → クライアントにハイドレーションする」流れが基本方針です。

### サーバー側でキャッシュを構築する（Server Template）

まず、Server Component側でデータをフェッチし、Query Clientにプリフェッチします。  
これにより、クライアントは“ウォームなキャッシュ”を受け取って即描画できるようになります。

```
// features/requests/components/server/RequestsPageTemplate.tsx
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { RequestList } from '@/features/requests/components/client/RequestList'
import { requestKeys } from '@/features/requests/queries/keys'
import {
  ensureRequestListResponse,
  selectRequestListFetcher,
} from '@/features/requests/queries/requestList.helpers'
import { getQueryClient } from '@/shared/lib/query-client'
import {
  listAllRequestsServer,
  listAssignedRequestsServer,
  listMyRequestsServer,
} from '@/external/handler/request/query.server'

export async function RequestsPageTemplate({
  filters = {},
  activeTabKey,
}) {
  const queryClient = getQueryClient()

  await queryClient.prefetchQuery({
    queryKey: requestKeys.list(filters),
    queryFn: async () => {
      const fetcher = selectRequestListFetcher(filters, {
        listMine: listMyRequestsServer,
        listAssigned: listAssignedRequestsServer,
        listAll: listAllRequestsServer,
      })
      const response = await fetcher()
      return ensureRequestListResponse(response)
    },
  })

  return (
    <section className="space-y-6 px-6 py-8">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <RequestList filters={filters} />
      </HydrationBoundary>
    </section>
  )
}
```

ポイント：

- サーバーで最初に正しいハンドラ（自分／担当／全体）を選択してプリフェッチ
- ensureRequestListResponse で DTOをバリデーションしてからReactに渡す
- HydrationBoundary により、キャッシュを“温めた状態”でクライアントへ渡す

この流れで、SSRとCSRのズレ（hydration mismatch）を根本的に防げます。

### クライアント側も同じキーを使う（Query再利用）

クライアント側では、TanStack Queryの useQuery フックを使って同じキーを参照します。  
これにより、初回レンダーでもキャッシュ済みのデータをそのまま再利用できます。

```
// features/requests/queries/useRequestListQuery.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import { requestKeys } from '@/features/requests/queries/keys'
import {
  ensureRequestListResponse,
  selectRequestListFetcher,
} from '@/features/requests/queries/requestList.helpers'
import {
  listAllRequestsAction,
  listAssignedRequestsAction,
  listMyRequestsAction,
} from '@/external/handler/request/query.action'

export const useRequestListQuery = (filters = {}) =>
  useQuery({
    queryKey: requestKeys.list(filters),
    queryFn: async () => {
      const fetcher = selectRequestListFetcher(filters, {
        listMine: listMyRequestsAction,
        listAssigned: listAssignedRequestsAction,
        listAll: listAllRequestsAction,
      })
      const response = await fetcher()
      return ensureRequestListResponse(response)
    },
  })
```

サーバーでプリフェッチしたQueryと、クライアントのQueryが完全に一致するため、  
二重リクエストも発生せず、画面の再描画も最小限で済みます。

### データフロー：Container → Hook → Presenter

```
// features/requests/components/client/RequestList/RequestListContainer.tsx
'use client'

import { RequestListPresenter } from './RequestListPresenter'
import { useRequestList } from './useRequestList'

export function RequestListContainer({ filters }) {
  const { summaries, isLoading, isRefetching, errorMessage } = useRequestList({ filters })

  return (
    <RequestListPresenter
      requests={summaries}
      isLoading={isLoading}
      isRefetching={isRefetching}
      errorMessage={errorMessage}
    />
  )
}
```

ContainerはHookからデータを受け取り、  
Presenterは\*\*「渡されたデータを描画するだけ」\*\*に専念します。  
データ変換やリトライなどのロジックはすべてHook側に閉じ込める設計です。

### 静的ビューにはHydrationを使わない

統計パネルやダッシュボードの集計値など、  
サーバーで完結する静的データはTanStack Queryを使う必要はありません。

Promise.allなどでサーバー側で完結できるなら、  
「Hydrationを使わない勇気」も大事です

何でもかんでも useQuery に入れると、逆にバグを招きます。  
“動的なものだけクライアントへ渡す” これがServer-first設計の原則です。

### Mutationも精密に無効化する

更新処理（Approveなど）では、  
invalidateQueries() を乱発せず、影響範囲を限定して無効化します。

```
// features/approvals/hooks/useApproveRequest.ts
return useMutation({
  mutationFn: async ({ requestId }) => {
    const result = await approveRequestAction({ requestId })
    if (!result.success) throw new Error(result.error ?? 'Failed to approve request')
    return { requestId }
  },
  onSuccess: async (_data, { requestId }) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: approvalKeys.pending() }),
      queryClient.invalidateQueries({ queryKey: requestKeys.detail(requestId) }),
      queryClient.invalidateQueries({ queryKey: requestKeys.all }),
      queryClient.invalidateQueries({ queryKey: requestKeys.history(requestId) }),
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() }),
    ])
  },
})
```

無闇に invalidateQueries() を使うと、  
画面全体が再レンダーされUXが悪化します。  
「どのデータが変わったか」を明示的に指定することが大切です。

## 原則4：品質を“仕組み”で担保する

大規模なApp Router開発では、「設計を守る」よりも「設計が壊れない仕組み」を作るほうが重要です。  
ここでは、そのために導入したESLintルール・DTO検証・テスト設計・外部層パターンについて紹介します。

### 1\. ESLintルールでアーキテクチャ違反を防ぐ

「人がルールを覚えて守る」には限界があります。  
そこで、設計上の禁則をすべてESLintでコード化しました。

```
frontend/eslint-local-rules/
├─ restrict-service-imports.js  # client層からservice層へのimportを禁止
├─ restrict-action-imports.js   # Server Actionsはclient/hooksでのみ利用可
├─ use-nextjs-helpers.js        # PageProps/LayoutProps、next/navigationの利用を強制
├─ use-client-check.js          # 'use client' の配置を検証
└─ use-server-check.js          # 'use server' の配置を検証
```

例えば restrict-service-imports により、  
clientコンポーネントが誤ってexternal/service/\*\*をimportすると即ビルドが失敗します。

### 2\. DTO（データ構造）の検証を徹底する

バックエンドのレスポンスが1フィールド変わるだけで、  
フロントの動作が壊れる  
そんな経験は誰にでもあるはずです。

この問題を防ぐために、  
APIレスポンスは必ずDTO（データ転送オブジェクト）を通して検証しています。

```
// external/dto/request/ensureRequestListResponse.ts
import type { RequestListResponse, RequestListResult } from './types'

const DEFAULT_LIMIT = 20

export function ensureRequestListResponse(response: RequestListResponse): RequestListResult {
  if (!response.success || !response.requests) {
    throw new Error(response.error ?? 'Failed to load requests')
  }
  return {
    requests: response.requests,
    total: response.total ?? response.requests.length,
    limit: response.limit ?? DEFAULT_LIMIT,
    offset: response.offset ?? 0,
  }
}
```

バックエンドの構造が変わっても、  
DTOで型を保証していれば即座に検知できる。

「Zod」や「TypeScript型」と組み合わせておくと、  
テストを書く前に“構造的安全性”を担保できます。

### 3\. ルートごとのError Boundaryで壊れないUIを

App Routerでは、ルート単位で error.tsx と loading.tsx を設置できます。  
これを全主要画面に配置しておくことで、  
「1つの通信エラーでアプリ全体が真っ白になる」状態を防げます。

### 4\. テストは“隣に置く”

Hooks、Presenter、Server Templateなどのテストは、  
すべて対象ファイルと同じ階層に配置します。

```
components/client/RequestList/
├─ RequestListPresenter.tsx
├─ RequestListPresenter.test.tsx
```

これにより、PRレビュー時にロジックとテストを同時に確認できるようになります。  
Vitest + React Testing Libraryを使い、  
「開く → 変更する → テスト回す」がワンステップで完結するようにしました。

### 5\. external層は“将来の変更に強い

最後に、このアーキテクチャの最大の狙い。  
それは「UI層がバックエンド実装に依存しないこと」です。

UIは external/handler/\*\* を経由してデータを取得します。  
したがって、もしバックエンドをDrizzleからGo製のMicroservicesに移行しても、  
変更するのは external/service/\*\* のみ。  
Reactコンポーネントやhooksは一切触る必要がありません。

UIが“何を呼ぶか”ではなく、“誰を通じて呼ぶか”を固定する。  
これが「将来のリファクタリングコストをゼロに近づける設計」です。

## 学びとスケーリングの知見

- /app はルーティングだけ、/features は司令塔、/external は外部接続。
- Server-first × TanStack Query による温かいキャッシュでUXが快適。
- Lintが“チームの記憶”を代替する。  
  「◯◯し忘れてた」議論はもう不要。
- external層のアダプタパターンにより、Go・Rust・別DBなどへの拡張が容易。

### こんなチームにおすすめ

- Server ActionsやRSCを多用し、複雑なサーバーロジックを持つアプリを作っている
- 複数の機能・画面を並行開発している
- 将来的にバックエンドを差し替える可能性がある

## さらに深く知りたい方へ

本記事で紹介した構成は、すべて以下のリポジトリで公開しています👇

気になる方は、ぜひクローンして  
実際に新しい機能を1つ追加してみてください。

構造が一貫しているプロジェクトの“予測可能な快感”を一度体験すると、  
もう場当たり的なApp Router開発には戻れなくなるはずです。

https://github.com/YukiOnishi1129/next-app-router-architecture
