import { InvalidContext } from './JsonRpcException.js';
import { $Object, $Tuple } from './schemas/Structure.js';
import type { FromSchema, JSONSchema } from './types.js';

type ByPositionSchema = {
    readonly type: 'array';
    readonly items: readonly JSONSchema[];
};
type ObjectProperties = {
    readonly [key: string]: JSONSchema;
};
type ByNameSchema = {
    readonly type: 'object';
    readonly properties: ObjectProperties;
};
export type ParameterSchema = ByPositionSchema | ByNameSchema | undefined;

export interface JsonRpcMethodSchema<
    PrmSch extends ParameterSchema,
    RtnSch extends JSONSchema | undefined,
> {
    readonly $params?: PrmSch;
    readonly $return?: RtnSch;
}

/**
 * クライアント generic (`Schema`) の受け口となる leaf 型。
 * - 素の method schema (`$params`/`$return`) … 従来の JsonRpcSchema 経路 (WS/MessagePort 等)
 * - `JsonRpcMethodDefinition` … StaticRouter に直接埋めた定義
 * - `() => Promise<...>` / `Promise<...>` … route thunk map (lazy import) 経路
 */
type SchemaLeaf =
    | JsonRpcMethodSchema<any, any>
    | JsonRpcMethodDefinition<any, any, any>
    | (() => Promise<unknown>)
    | Promise<unknown>;

/**
 * クライアント generic の**適合検証用の固定上限型**。
 * 自己参照 (`Schema extends Conforms<Schema>`) や厳密な `RouteMap<Ctx>` は
 * 巨大な route リテラルで TS2589 (instantiation too deep) を誘発するため、
 * 「各 path が leaf か、さらに入れ子の schema 形」という**非自己参照の再帰上限**にして
 * 適合検証を必ず通しつつ再帰爆発を避ける。primitive / 非 method 形の leaf は弾かれる。
 */
export type AnySchemaShape = {
    readonly [path: string]: SchemaLeaf | AnySchemaShape;
};

export type Params<Schema> = Schema extends ByPositionSchema
    ? FromSchema<Schema>
    : Schema extends ByNameSchema
      ? [FromSchema<Schema>]
      : Schema extends undefined
        ? []
        : never;
export type Return<Schema> = Schema extends undefined
    ? void
    : Schema extends JSONSchema
      ? FromSchema<Schema>
      : never;

export type JsonRpcMethod<
    Context,
    PrmSch extends ParameterSchema,
    RtnSch extends JSONSchema | undefined,
> = (
    this: Context,
    ...params: Params<PrmSch>
) => Promise<Return<RtnSch>> | Return<RtnSch>;

type ContextClass<Ctx> = { new (...args: any[]): Ctx };
type Context<Cls, FB> = Cls extends ContextClass<infer Ctx> ? Ctx : FB;

/**
 * OpenRPC 準拠のメソッドメタ情報。
 * 型 (JsonRpcCaller 等) は $params/$return のみ参照するため、メタは呼び出し型に影響しない。
 */
export type JsonRpcParameterMeta = {
    readonly summary?: string;
    readonly description?: string;
    readonly required?: boolean;
    readonly deprecated?: boolean;
};
export type JsonRpcResultMeta = {
    readonly name: string;
    readonly summary?: string;
    readonly description?: string;
};
export type JsonRpcErrorMeta = {
    readonly code: number;
    readonly message: string;
    readonly data?: unknown;
};
export type JsonRpcExampleMeta = {
    readonly name: string;
    readonly summary?: string;
    readonly description?: string;
    readonly params: readonly unknown[] | Readonly<Record<string, unknown>>;
    readonly result?: unknown;
};
export type JsonRpcExternalDocsMeta = {
    readonly url: string;
    readonly description?: string;
};
export type JsonRpcMethodMeta = {
    readonly summary?: string;
    readonly description?: string;
    readonly tags?: readonly string[];
    readonly result?: JsonRpcResultMeta;
    /**
     * パラメータ別メタ。paramsByName の場合キーは $Object のプロパティ名。
     * paramsByPosition の場合はキーの記述順が位置に対応する (キー名が param name になる)。
     */
    readonly params?: Readonly<Record<string, JsonRpcParameterMeta>>;
    readonly errors?: readonly JsonRpcErrorMeta[];
    readonly examples?: readonly JsonRpcExampleMeta[];
    readonly deprecated?: boolean;
    readonly externalDocs?: JsonRpcExternalDocsMeta;
};

const methodKey = Symbol('JsonRpcMethodDefinition.method');
export class JsonRpcMethodDefinition<
    Context,
    PrmSch extends ParameterSchema,
    RtnSch extends JSONSchema | undefined,
> implements JsonRpcMethodSchema<PrmSch, RtnSch>
{
    static readonly method: typeof methodKey = methodKey;
    readonly [methodKey]: JsonRpcMethod<Context, PrmSch, RtnSch>;

    constructor(
        method: JsonRpcMethod<Context, PrmSch, RtnSch>,
        readonly $params: PrmSch,
        readonly $return: RtnSch,
        readonly $contextClass?: ContextClass<Context>,
        readonly $meta?: JsonRpcMethodMeta,
    ) {
        this[methodKey] = method;
    }

    // instanceof はモジュール実体が二重ロードされた際に一致しないため、duck-typing でも判定する
    static isDefinition(
        obj: unknown,
    ): obj is JsonRpcMethodDefinition<any, any, any> {
        if (obj instanceof JsonRpcMethodDefinition) return true;
        const key = (obj as any)?.constructor?.method;
        return typeof key === 'symbol' && (obj as any)[key] instanceof Function;
    }

    $apply(ctx: Context, params: any) {
        if (this.$contextClass && !(ctx instanceof this.$contextClass)) {
            const passedCtxType = (ctx as any)?.constructor?.name ?? typeof ctx;
            throw new InvalidContext(
                `Invalid context: expected ${this.$contextClass.name} but got ${passedCtxType}`,
            );
        }
        if (this.$params?.type === 'object') params = [params];
        return this[methodKey].apply(ctx, params);
    }

    static get builder() {
        return new DefinitionBuilder(undefined, undefined, undefined);
    }
}

class DefinitionBuilder<
    CtxCls extends ContextClass<any> | undefined,
    PrmSch extends ParameterSchema,
    RtnSch extends JSONSchema | undefined,
> implements JsonRpcMethodSchema<PrmSch, RtnSch>
{
    constructor(
        readonly $contextClass: CtxCls,
        readonly $params: PrmSch,
        readonly $return: RtnSch,
        readonly $meta?: JsonRpcMethodMeta,
    ) {}

    define<Ctx = {}>(
        method: JsonRpcMethod<Context<CtxCls, Ctx>, PrmSch, RtnSch>,
    ) {
        return new JsonRpcMethodDefinition<
            Context<CtxCls, Ctx>,
            PrmSch,
            RtnSch
        >(method, this.$params, this.$return, this.$contextClass, this.$meta);
    }

    contextClass<CtxCls extends ContextClass<any>>(contextClass: CtxCls) {
        return new DefinitionBuilder(
            contextClass,
            this.$params,
            this.$return,
            this.$meta,
        );
    }

    meta(meta: JsonRpcMethodMeta) {
        return new DefinitionBuilder(
            this.$contextClass,
            this.$params,
            this.$return,
            meta,
        );
    }

    params<NewPrm extends ParameterSchema>(params: NewPrm) {
        return new DefinitionBuilder(
            this.$contextClass,
            params,
            this.$return,
            this.$meta,
        );
    }

    paramsByName<NewPrm extends ObjectProperties>(params: NewPrm) {
        return new DefinitionBuilder(
            this.$contextClass,
            $Object(params),
            this.$return,
            this.$meta,
        );
    }

    paramsByPosition<NewPrm extends readonly JSONSchema[]>(...params: NewPrm) {
        return new DefinitionBuilder(
            this.$contextClass,
            $Tuple(...params),
            this.$return,
            this.$meta,
        );
    }

    return<NewRtn extends JSONSchema | undefined>(rtn: NewRtn) {
        return new DefinitionBuilder(
            this.$contextClass,
            this.$params,
            rtn,
            this.$meta,
        );
    }

    /** @deprecated paramsByPosition を使用してください */
    paramsSchema<NewPrm extends readonly JSONSchema[]>(...params: NewPrm) {
        return this.paramsByPosition(...params);
    }
    /** @deprecated return を使用してください */
    returnSchema<NewRtn extends JSONSchema | undefined>(rtn: NewRtn) {
        return this.return(rtn);
    }
}
