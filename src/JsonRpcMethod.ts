import { type FromSchema } from 'json-schema-to-ts';
import { type JSONSchema } from "./types.js";
import { InvalidContext } from './JsonRpcException.js';

export interface JsonRpcMethodSchema<PrmSch extends readonly JSONSchema[], RtnSch extends JSONSchema|undefined> {
    readonly $params: PrmSch;
    readonly $return?: RtnSch;
}

export type Params<Schema>
    = Schema extends readonly [ JSONSchema, ...infer Rmn ]
        ? (
            Schema[0] extends { optional: true }
                ? [ p?: FromSchema<Schema[0]>, ...Params<Rmn> ]
                : [ FromSchema<Schema[0]>, ...Params<Rmn> ]
        )
    : Schema extends readonly []
        ? []
    : never;
export type Return<Schema>
    = Schema extends undefined
        ? void
    : Schema extends JSONSchema
        ? FromSchema<Schema>
    : never;

export type JsonRpcMethod<Context, PrmSch extends readonly JSONSchema[], RtnSch extends JSONSchema|undefined>
    = (this: Context, ...params: Params<PrmSch>) => Promise<Return<RtnSch>>|Return<RtnSch>;

type ContextClass<Ctx> = { new(...args: any[]): Ctx };
type Context<Cls, FB> = Cls extends ContextClass<infer Ctx> ? Ctx : FB;

const methodKey = Symbol('JsonRpcMethodDefinition.method');
export class JsonRpcMethodDefinition<Context, PrmSch extends readonly JSONSchema[], RtnSch extends JSONSchema|undefined> implements JsonRpcMethodSchema<PrmSch, RtnSch> {
    static readonly method: typeof methodKey = methodKey;
    readonly [methodKey]: JsonRpcMethod<Context, PrmSch, RtnSch>;

    constructor(
        method: JsonRpcMethod<Context, PrmSch, RtnSch>,
        readonly $params: PrmSch,
        readonly $return: RtnSch,
        readonly $contextClass?: ContextClass<Context>,
    ) {
        this[methodKey] = method;
    }

    apply(ctx: Context, params: Params<PrmSch>) {
        if(this.$contextClass && !(ctx instanceof this.$contextClass)) {
            const passedCtxType = (ctx as any)?.constructor?.name ?? typeof ctx;
            throw new InvalidContext(`Invalid context: expected ${this.$contextClass.name} but got ${passedCtxType}`);
        }
        return this[methodKey].apply(ctx, params);
    }

    static get builder(){
        return new DefinitionBuilder(undefined, [], undefined);
    }
}

class DefinitionBuilder<CtxCls extends ContextClass<any>|undefined, PrmSch extends readonly JSONSchema[], RtnSch extends JSONSchema|undefined> implements JsonRpcMethodSchema<PrmSch, RtnSch> {
    constructor(
        readonly $contextClass: CtxCls,
        readonly $params: PrmSch,
        readonly $return: RtnSch,
    ) {}

    define<Ctx = {}>(method: JsonRpcMethod<Context<CtxCls, Ctx>, PrmSch, RtnSch>) {
        return new JsonRpcMethodDefinition<Context<CtxCls, Ctx>, PrmSch, RtnSch>(method, this.$params, this.$return, this.$contextClass);
    }

    contextClass<CtxCls extends ContextClass<any>>(contextClass: CtxCls) {
        return new DefinitionBuilder(contextClass, this.$params, this.$return);
    }

    paramsSchema<NewPrm extends readonly JSONSchema[]>(...params: NewPrm) {
        return new DefinitionBuilder(this.$contextClass, params, this.$return);
    }
    
    returnSchema<NewRtn extends JSONSchema|undefined>(rtn: NewRtn) {
        return new DefinitionBuilder(this.$contextClass, this.$params, rtn);
    }
}
