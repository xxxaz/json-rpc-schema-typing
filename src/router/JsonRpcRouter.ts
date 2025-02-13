import { JsonSerializable } from "@xxxaz/stream-api-json";
import { JsonRpcMethodDefinition, JsonRpcMethodSchema, Params, Return } from "../JsonRpcMethod.js";
import { hashObject } from "./hashObject.js";

type AsyncFunction<P, R> = (...params: Params<P>) => Promise<Return<R>>;
type NoticeFunction<Prm> = (...params: Params<Prm>) => void;

export abstract class JsonRpcRouter<Context = {}> {
    abstract resolve(methodPath: string): Promise<JsonRpcRouter<Context>|JsonRpcMethodDefinition<Context, any, any>|null>;
    abstract resolveChild(methodPath: string): Promise<JsonRpcRouter<Context>|JsonRpcMethodDefinition<Context, any, any>|null>;
    abstract enumerate(): AsyncIterable<string>;

    async schema(): Promise<JsonRpcSchema> {
        const entries = [] as [string, JsonRpcMethodSchema<any, any>|JsonRpcSchema][];
        for await (const key of this.enumerate()) {
            const child = await this.resolveChild(key);
            if (!child) continue;
            if (child instanceof JsonRpcRouter) {
                const schema = await child.schema();
                if (Object.keys(schema).length > 0) {
                    entries.push([key, schema]);
                }
                continue;
            }
            const { $params, $return } = child;
            entries.push([key, { $params, $return }]);
        }
        return Object.fromEntries(entries) as JsonRpcSchema;
    }
    

    async schemaTypeScript() {
        const schema = await this.schema();
        const hash = await hashObject(schema);
        return [
            `export default ${JSON.stringify(schema)} as const;`,
            `export const hash = ${JSON.stringify(hash)} as const;`,
        ].join('\n');
    }
}

export type JsonRpcSchema = JsonSerializable & {
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