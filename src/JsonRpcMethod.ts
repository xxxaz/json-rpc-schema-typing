import { validate, type ValidationError } from 'json-schema';
import { type FromSchema } from 'json-schema-to-ts';
import { type JSONSchema } from "./types.js";
import { InvalidParams, InvalidReturn } from './JsonRpcException.js';

export interface JsonRpcMethodSchema<PrmSch extends readonly JSONSchema[], RtnSch extends JSONSchema|undefined> {
    readonly $params: PrmSch;
    readonly $return: RtnSch;
}

export type Params<Schema>
    = Schema extends readonly [ JSONSchema, ...infer Rmn ]
        ? [ FromSchema<Schema[0]>, ...Params<Rmn> ]
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


const methodKey = Symbol('JsonRpcMethodDefinition.method');
export class JsonRpcMethodDefinition<Context, PrmSch extends readonly JSONSchema[], RtnSch extends JSONSchema|undefined> implements JsonRpcMethodSchema<PrmSch, RtnSch> {
    static readonly method: typeof methodKey = methodKey;
    readonly [methodKey]: JsonRpcMethod<Context, PrmSch, RtnSch>;

    constructor(
        method: JsonRpcMethod<Context, PrmSch, RtnSch>,
        readonly $params: PrmSch,
        readonly $return: RtnSch
    ) {
        this[methodKey] = method;
    }

    apply(ctx: Context, params: Params<PrmSch>) {
        return this[methodKey].apply(ctx, params);
    }

    validateParams(params: unknown[]): params is Params<PrmSch> {
        const errors = this.$params
            .map((schema, index) => validate(params[index] as any, schema))
            .map(({ errors }, argument) => errors.map(({ property, message }) => ({ argument, property, message })))
            .flat();
        if(errors.length > 0) {
            const message = errors.map(({ argument, property, message }) => `args[${argument}].${property}: ${message}`).join('\n');
            throw new InvalidParams(message, errors);
        }
        return true;
    }

    validateReturn(result: unknown): result is Return<RtnSch> {
        if(!this.$return) return result === undefined;
        const errors = validate(result as any, this.$return).errors.map(({ property, message }) => ({ property, message }));
        if (errors.length > 0) {
            const message = errors.map(({ property, message }) => `return.${property}: ${message}`).join('\n');
            throw new InvalidReturn(message, errors);
        }
        return true;
    }

    static define<Context = {}>(method: JsonRpcMethod<Context, [], undefined>) {
        return new this<Context, [], undefined>(method, [], undefined);
    }
    
    static paramsSchema<Prm extends readonly JSONSchema[]>(...params: Prm) {
        return new DefinitionBuilder(params, undefined);
    }

    static returnSchema<Rtn extends JSONSchema|undefined>(rtn?: Rtn) {
        return new DefinitionBuilder([] as const, rtn);
    }

}

class DefinitionBuilder<PrmSch extends readonly JSONSchema[], RtnSch extends JSONSchema|undefined> implements JsonRpcMethodSchema<PrmSch, RtnSch> {
    constructor(
        readonly $params: PrmSch,
        readonly $return: RtnSch
    ) {}

    define<Context = {}>(method: JsonRpcMethod<Context, PrmSch, RtnSch>) {
        return new JsonRpcMethodDefinition<Context, PrmSch, RtnSch>(method, this.$params, this.$return);
    }

    paramsSchema<NewPrm extends readonly JSONSchema[]>(...params: NewPrm) {
        return new DefinitionBuilder(params, this.$return);
    }
    
    returnSchema<NewRtn extends JSONSchema|undefined>(rtn: NewRtn) {
        return new DefinitionBuilder(this.$params, rtn);
    }
}
