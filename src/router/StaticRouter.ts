import {
    JsonRpcMethodDefinition,
    JsonRpcMethodSchema,
} from '../JsonRpcMethod.js';
import { JsonRpcRouter, JsonRpcSchema } from './JsonRpcRouter.js';

export type StaticRoute<Ctx> =
    | RouteMap<Ctx>
    | JsonRpcMethodDefinition<Ctx, any, any>;
/**
 * `() => import('./path.js')` 形式の遅延エントリ。
 * 解決結果 (module) は `resolveChild` 内で `isDefinition` ガードにより検証し、
 * 戻り値の型を `JsonRpcMethodDefinition | StaticRouter | null` に固定する。
 *
 * 解決結果の型を `unknown` にしているのは意図的。ここを `StaticRoute<Ctx>`
 * (= `RouteMap<Ctx> | JsonRpcMethodDefinition`) にすると、具体 route リテラルとの
 * assignability 検査で thunk の `{ default: MethodDef }` が
 * `StaticRoute → RouteMap → MethodDef の $params/$return` を再帰展開し、
 * 単一メソッドの route map でも TS2589 (型 instantiation が深すぎる) を誘発する。
 * dispatch 型はモジュール実体の形を静的に知り得ず実行時ガードに委ねるため、
 * ここを `unknown` に固定するのは型安全の毀損ではなく責務の適切な分離。
 * client 側の引数・返り値型は `SchemaTree<typeof routes>` が具体リテラルから
 * 導出する別経路であり、本型に一切影響されない。
 */
export type LazyRouteThunk<Ctx> = () => Promise<unknown>;
export type RouteMap<Ctx> = {
    readonly [path: string]:
        | StaticRoute<Ctx>
        | Promise<StaticRoute<Ctx> | undefined>
        | LazyRouteThunk<Ctx>;
};

type RouteCache<Ctx> = {
    [path: string]:
        | StaticRouter<Ctx>
        | JsonRpcMethodDefinition<Ctx, any, any>
        | null;
};

/**
 * RouteMap エントリの型からメソッド定義の型を導出する。
 * lazy thunk (`() => import()`) は解決後モジュールの default を unwrap する。
 */
export type LazyDef<T> = T extends () => Promise<infer M>
    ? M extends { default: infer D }
        ? D
        : M
    : T extends Promise<infer P>
      ? P
      : T;

/**
 * route map の型から「メソッドパス ↔ JsonRpcMethodDefinition」を束ねた静的単一型を導出する。
 * leaf は JsonRpcMethodDefinition ($params/$return を持つ) なので
 * そのまま client のジェネリクス (JsonRpcCaller) に渡せる。
 */
export type SchemaTree<Routes> = {
    readonly [K in keyof Routes]: SchemaNode<LazyDef<Routes[K]>>;
};
type SchemaNode<T> =
    T extends JsonRpcMethodDefinition<any, any, any>
        ? T
        : T extends object
          ? SchemaTree<T>
          : never;

export class StaticRouter<Ctx> extends JsonRpcRouter<Ctx> {
    constructor(private readonly routeMap: RouteMap<Ctx>) {
        super();
    }

    #cache = {} as RouteCache<Ctx>;

    /**
     * 1 セグメントを解決する。lazy thunk (`() => import()`) の呼び出しと ES module の
     * `default` unwrap は「その関数内でのみ有効な一時的な扱い」で、`isDefinition` による
     * ランタイム型ガードで検証したうえで、**戻り値の型を検証済みの型に固定**する
     * (`unknown`/緩い型を呼び出し側へ漏らさない)。
     */
    async resolveChild(
        methodPath: string,
    ): Promise<
        StaticRouter<Ctx> | JsonRpcMethodDefinition<Ctx, any, any> | null
    > {
        if (methodPath in this.#cache) return this.#cache[methodPath];
        const entry = this.routeMap[methodPath];
        const loaded =
            typeof entry === 'function' ? await entry() : await entry;
        const resolved = unwrapModule<Ctx>(loaded);
        if (!resolved) return (this.#cache[methodPath] = null);
        if (JsonRpcMethodDefinition.isDefinition(resolved)) {
            // isDefinition が true の枝で resolved は JsonRpcMethodDefinition に narrow 済み。
            return (this.#cache[methodPath] = resolved);
        }
        // def でないことを isDefinition で検証済み → RouteMap<Ctx> として子ルータへ。
        // (generic Ctx 越しでは負の narrowing が効かないため局所キャスト。戻り値型は上で固定済み)
        return (this.#cache[methodPath] = new StaticRouter<Ctx>(
            resolved as RouteMap<Ctx>,
        ));
    }

    async resolve(
        methodPath: string | string[],
    ): Promise<
        JsonRpcRouter<Ctx> | JsonRpcMethodDefinition<Ctx, any, any> | null
    > {
        if (!methodPath || methodPath.length === 0) return this;
        if (typeof methodPath === 'string') methodPath = methodPath.split('.');
        const [head, ...tail] = methodPath;

        const child = await this.resolveChild(head);
        if (tail.length === 0) return child;
        if (!child) {
            console.warn(`Route not found: ${head}`);
            return null;
        }

        if (JsonRpcMethodDefinition.isDefinition(child)) {
            console.warn(`Method appear middle in route : ${head}`);
            return null;
        }

        // def でも null でもないことを検証済み → StaticRouter として再帰 (generic narrowing の局所キャスト)
        return (child as StaticRouter<Ctx>).resolve(tail);
    }

    async *enumerate(): AsyncIterable<string> {
        for (const key in this.routeMap) {
            yield key;
        }
    }
}

/**
 * lazy thunk の解決結果から ES module wrapper を剥がす。
 * 「default を持つ module namespace なら default を採用」という一時的なランタイム判定を
 * この関数内に閉じ込め、戻り値は `StaticRoute<Ctx>|undefined` に固定する。
 */
function unwrapModule<Ctx>(loaded: unknown): StaticRoute<Ctx> | undefined {
    if (
        loaded &&
        typeof loaded === 'object' &&
        !JsonRpcMethodDefinition.isDefinition(loaded) &&
        'default' in loaded
    ) {
        // module namespace ({ default }) と runtime 判定できた場合のみ default を採用する局所キャスト
        return (loaded as { default: StaticRoute<Ctx> }).default;
    }
    // lazy thunk の解決結果は dispatch 型では unknown。実行時判定を経て戻り値型を固定する局所キャスト。
    return loaded as StaticRoute<Ctx> | undefined;
}

/**
 * lazy thunk エントリ (`() => import()`) を含む RouteMap を受ける StaticRouter の公開 alias。
 * (StaticRouter 自体が lazy thunk を解決できるため、意味を明示するための別名)
 */
export const LazyRouter = StaticRouter;
export type LazyRouter<Ctx> = StaticRouter<Ctx>;
