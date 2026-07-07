import type { JsonRpcCaller } from '../src/client/JsonRpcClient.js';
import type {
    JsonRpcMethodDefinition,
    Params,
    Return,
} from '../src/JsonRpcMethod.js';
import type { LazyDef, SchemaTree } from '../src/router/StaticRouter.js';

import type lazyMethod from './fixtures/lazyMethod.js';

type Assert<T extends true> = T;
type Eq<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
        ? true
        : false;

// LazyRouter に渡す route thunk map (値は実行時ロードされない type-only 想定)
const routes = {
    lazy: {
        method: () => import('./fixtures/lazyMethod.js'),
    },
    nested: () => import('./fixtures/lazyRoutes.js'),
} as const;

describe('SchemaTree / LazyDef 型導出 (コンパイルレベル検証)', () => {
    test('LazyDef が thunk から default export の定義型を導出する', () => {
        type Thunk = (typeof routes)['lazy']['method'];
        // 定義型全体の Eq 比較は Params<> (FromSchema) の展開で TS2589 になるため、$params/$return 単位で比較する
        type _ThunkParams = Assert<
            Eq<LazyDef<Thunk>['$params'], (typeof lazyMethod)['$params']>
        >;
        type _ThunkReturn = Assert<
            Eq<LazyDef<Thunk>['$return'], (typeof lazyMethod)['$return']>
        >;
        type _ThunkIsDefinition = Assert<
            LazyDef<Thunk> extends JsonRpcMethodDefinition<any, any, any>
                ? true
                : false
        >;

        // 値/Promise エントリはそのまま通す
        type _Value = Assert<
            Eq<
                LazyDef<typeof lazyMethod>['$params'],
                (typeof lazyMethod)['$params']
            >
        >;
        type _Promised = Assert<
            Eq<
                LazyDef<Promise<typeof lazyMethod>>['$params'],
                (typeof lazyMethod)['$params']
            >
        >;
        expect(true).toBe(true);
    });

    test('SchemaTree がメソッドパス↔定義を束ねた静的単一型になる', () => {
        type Tree = SchemaTree<typeof routes>;

        // leaf は JsonRpcMethodDefinition ($params/$return を持つ)
        type LazyLeaf = Tree['lazy']['method'];
        type _LeafParams = Assert<
            Eq<LazyLeaf['$params'], (typeof lazyMethod)['$params']>
        >;
        type _LeafIsDefinition = Assert<
            LazyLeaf extends JsonRpcMethodDefinition<any, any, any>
                ? true
                : false
        >;

        // thunk が nested RouteMap (default export) を返す場合も辿れる
        type NestedLeaf = Tree['nested']['add'];
        type _NestedIsDefinition = Assert<
            NestedLeaf extends JsonRpcMethodDefinition<any, any, any>
                ? true
                : false
        >;
        expect(true).toBe(true);
    });

    test('JsonRpcCaller<routes 型> が呼び出しシグネチャを導出する', () => {
        type Caller = JsonRpcCaller<typeof routes>;

        type LazyCall = Caller['lazy']['method'];
        type _LazyParams = Assert<
            Eq<Parameters<LazyCall>, Params<(typeof lazyMethod)['$params']>>
        >;
        type _LazyReturn = Assert<
            Eq<
                Awaited<ReturnType<LazyCall>>,
                Return<(typeof lazyMethod)['$return']>
            >
        >;
        // by-name: 単一オブジェクト引数
        type _LazyParamShape = Assert<
            Parameters<LazyCall>[0] extends { name: string } ? true : false
        >;

        // by-position: タプル引数
        type AddCall = Caller['nested']['add'];
        type _AddParams = Assert<Eq<Parameters<AddCall>, [number, number]>>;
        type _AddReturn = Assert<Eq<Awaited<ReturnType<AddCall>>, number>>;

        // notice も持つ
        type _HasNotice = Assert<
            LazyCall['notice'] extends (...args: any) => void ? true : false
        >;
        expect(true).toBe(true);
    });
});
