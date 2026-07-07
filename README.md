# json-rpc-schema-typing

> 最終更新: 2026-07-07

スキーマファーストな JSON-RPC 2.0 フレームワーク。**メソッドのスキーマ (JSON Schema) を単一の真実源**とし、
サーバの実行時検証とクライアントの静的型付けを**同じスキーマから導出**することで、端から端まで型安全を担保する。

## 設計思想 (型安全の担保)

- **スキーマが真実源**: 各メソッドの引数 (`$params`) / 返り値 (`$return`) を JSON Schema で宣言する。ここから TypeScript 型 (`FromSchema`) と実行時バリデーション (ajv) の両方が導出される。
- **検証はサーバに一本化**: サーバは受信した params と応答の return をスキーマで検証する。クライアントは基本これを信頼する。
- **クライアントは型で守る**: クライアントの `.rpc.<namespace>.<method>(params)` は呼び出しシグネチャ・返り値が静的に型付けされる。存在しないメソッド・誤った引数はコンパイルエラーになる。
- **`any` に落とさない**: クライアントの `Schema` ジェネリクスは `AnySchemaShape` で制約され (`= any` のデフォルトを持たない)。型引数を省いた構築は「素通しで any」にはならず、必ず適合検証を通る。
- **一時キャストは関数内に閉じる**: ランタイム型ガード (`JsonRpcMethodDefinition.isDefinition` 等) で検証した内容を局所キャストで扱う場合も、**関数の戻り値型を検証済みの型に固定**し、`unknown`/緩い型を呼び出し側へ漏らさない (例: `StaticRouter.resolveChild`)。

## 構成要素

### スキーマビルダ (`@xxxaz/json-rpc-schema-typing`)

`$Object` / `$Array` / `$Tuple` / `$String` / `$Number` / `$Integer` / `$Boolean` / `$Null` /
`$Or` / `$And` / `$Xor` / `$Optional` / `$Enum` / `$EnumKeys` / `$EnumValues` / `$Omit` / `$Override` / `$Expand`。
`FromSchema<typeof schema>` で JSON Schema から TS 型を取り出す。

### メソッド定義 (`JsonRpcMethodDefinition.builder`)

スキーマとハンドラを 1 つの定義に束ねる (fluent builder)。

```ts
export default JsonRpcMethodDefinition.builder
    .contextClass(Context) // ハンドラの this 型
    .meta({ summary: '...', description: '...', tags: ['ns'], result: { name: 'result' } }) // OpenRPC 用メタ (任意)
    .paramsByName({ id: $Number }) // by-name ($Object) / .paramsByPosition(...) で by-position ($Tuple) / .params(raw) も可
    .return($String)
    .define(async function ({ id }) {
        /* handler */ return 'ok';
    });
```

- `.meta()` は OpenRPC 出力用の付随情報 (`summary` / `description` / `tags` / `result{name}` / `params` 別説明 / `errors` / `examples` / `deprecated`)。呼び出し型には影響しない。

### ルータ (`./router`)

メソッドパス → 定義への解決を担う。

- **`FileSystemRouter`**: ディレクトリを走査し、各ファイルの default export (`JsonRpcMethodDefinition`) をメソッドとして解決する (規約ベース)。
- **`StaticRouter`** (別名 **`LazyRouter`**): 明示的な route map から解決する。各エントリは
  「定義そのもの」「入れ子 route map」「`Promise`」に加え、**lazy thunk `() => import('./x.js')`** を受ける。
  thunk は呼び出し時に解決し、ES module の `default` を unwrap する (= handler の遅延ロードでコールドスタートを抑える)。
- **型ヘルパー** `SchemaTree<Routes>` / `LazyDef<T>`: route thunk map の**型**から「メソッドパス ↔ スキーマ」を束ねた単一型を導出する (クライアントのジェネリクスに渡せる)。

### サーバ (`./server`)

`JsonRpcServer` / `JsonRpcHttpReceiver` / `JsonRpcWebSocketReceiver` / `JsonRpcMessagePortReceiver`。
ルータで解決 → `$params` 検証 → ハンドラ実行 → `$return` 検証 → JSON-RPC 応答。

### クライアント (`./client`)

`JsonRpcClient` (基底) / `JsonRpcHttpClient` / `JsonRpcHttp2Client` / `JsonRpcWebSocketClient` / `JsonRpcMessagePortClient`。

- ジェネリクス `Schema extends AnySchemaShape` (必須・適合検証あり)。
- **`schema` 値は任意**。渡すと従来どおり実行時検証つき。**省略すると純粋なパスビルダ Proxy** として動作し (実行時検証なし・サーバ検証に一本化)、型は `Schema` ジェネリクスから導出される。
  - 型のみを与える使い方 (route thunk map の型を `import type` で渡す) では、クライアント bundle に実行時スキーマ値もサーバコードも載らない。

```ts
// 実行時スキーマ値あり (従来)
new JsonRpcHttpClient({ schema, postUrl });
// 型のみ (route thunk map の型を渡す・値は渡さない)
import type { hostRoutes } from 'server/host/routes';
new JsonRpcHttpClient<typeof hostRoutes>({ postUrl });
```

### OpenRPC 出力 (`./router` の emitter)

ルータ (全解決) + 各定義の `.meta()` から **OpenRPC Document** を生成する。`method.name` はパス、`paramStructure` は
`$params` の型 (object → by-name / array → by-position) から自動導出。document-level の `info` / `servers` / タグ定義は
emitter に渡す。`mcp` / `readonly` などのタグ規約で MCP ブリッジ等の下流に流用できる。

## 開発

```sh
npm run build   # tsc (types/esm/cjs 3 config) + post-build
npm test        # jest (実行時テスト + tsc 全体型検査 test/TypeCheck.test.ts)
npm run lint    # biome check (静的解析)
npm run format  # biome check --write (整形 + safe fix)
```

- **静的解析**: `biome.json` で設定。本ライブラリは型操作が主体なため `noExplicitAny` / `noParameterProperties` /
  `noAssignInExpressions` はライブラリのイディオムとして off。整形は 4-space / single quote / trailing comma。
- **型検査**: `strict: true`。`test/TypeCheck.test.ts` が whole-program tsc を実行し、型レベルの回帰を検出する。

## TODO

- JWT 対応
- OpenRPC 出力のリファレンス整備 (examples / links / $ref 集約)
- npm CommonJS パッケージの整理
