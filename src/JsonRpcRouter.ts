import { JsonRpcMethodDefinition, JsonRpcMethodSchema, Params, Return } from "./JsonRpcMethod.js";

type AsyncFunction<P, R> = (...params: Params<P>) => Promise<Return<R>>;
type NoticeFunction<Prm> = (...params: Params<Prm>) => void;

export type JsonRpcRouter<Context = {}> = JsonRpcSyncRouter<Context>|JsonRpcAsyncRouter<Context>;

export type JsonRpcSyncRouter<Context> = {
    readonly [path: string]: JsonRpcSyncRouter<Context>|JsonRpcMethodDefinition<Context, any, any>;
};

export type JsonRpcAsyncRouter<Context> = {
    readonly [path: string]: Promise<JsonRpcRouter<Context>|JsonRpcMethodDefinition<Context, any, any>|undefined>;
};

export type JsonRpcSchemaFrom<Router extends JsonRpcRouter> = {
    readonly [Key in keyof Router]
        : Router[Key] extends JsonRpcMethodDefinition<any, any, any>
            ? Router[Key]
        : Router[Key] extends JsonRpcRouter
            ? JsonRpcSchemaFrom<Router[Key]>
        : never;
};

export type JsonRpcSchema = {
    readonly [path: string]: JsonRpcMethodSchema<any, any>|JsonRpcSchema;
};

export type JsonRpcAccessor<Router extends JsonRpcRouter|JsonRpcSchema> = {
    readonly [Key in keyof Router]
        : Router[Key] extends JsonRpcRouter|JsonRpcSchema
            ? JsonRpcAccessor<Router[Key]>
        : Router[Key] extends JsonRpcMethodSchema<any, any>
            ? AsyncFunction<Router[Key]['$params'], Router[Key]['$return']>
        : never;
}

export type JsonRpcNotice<Router extends JsonRpcRouter|JsonRpcSchema> = {
    readonly [Key in keyof Router]
        : Router[Key] extends JsonRpcRouter|JsonRpcSchema
            ? JsonRpcNotice<Router[Key]>
        : Router[Key] extends JsonRpcMethodSchema<any, any>
            ? NoticeFunction<Router[Key]['$params']>
        : never;
}