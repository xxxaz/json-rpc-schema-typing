import { JsonStreamingParser, ParsingJsonArray } from '@xxxaz/stream-api-json';
import { LazyResolvers } from '@xxxaz/stream-api-json/utility';
import {
    ClientUncaughtError,
    InvalidParams,
    JsonRpcException,
} from '../JsonRpcException.js';
import type {
    AnySchemaShape,
    JsonRpcMethodSchema,
    ParameterSchema,
    Params,
    Return,
} from '../JsonRpcMethod.js';
import { JsonRpcValidator } from '../JsonRpcValidator.js';
import type { JsonRpcSchema } from '../router/JsonRpcRouter.js';
import type { LazyDef } from '../router/StaticRouter.js';
import type { JsonRpcRequest, JsonRpcResponse } from '../types.js';
import { stringifyStream } from '../utility.js';

type PostRpc = (
    request: ReadableStream<string>,
) => Promise<ReadableStream<string>>;
export type GenereteId = () => Promise<string | number>;

type JsonRpcClientOptions<Sch> = {
    /**
     * 実行時スキーマ。省略時は実行時検証を持たない純パスビルダとして動作する
     * (型はジェネリクスから導出され、検証はサーバーに一本化される)。
     */
    schema?: Sch & JsonRpcSchema;
    post: PostRpc;
    batch?: PostRpc;
    generateId?: GenereteId;
};

export const $generateId: unique symbol = Symbol('GenereteId');
export const $requestStack: unique symbol = Symbol('RequestsStack');
export const $methodPath: unique symbol = Symbol('MethodPath');

type TriggerFunction<ParamSch extends ParameterSchema, RtnSch> = {
    (...args: Params<ParamSch>): Promise<Return<RtnSch>>;
    notice(...args: Params<ParamSch>): void;
};

/**
 * スキーマ値の型 (JsonRpcSchema) と LazyRouter の route map 型のどちらからも
 * 呼び出し面の型を導出する。route map の lazy thunk / Promise エントリは
 * LazyDef で解決してから leaf ($params/$return を持つ) を判定する。
 */
export type JsonRpcCaller<Schema> = (0 extends 1 & Schema
    ? any
    : {
          readonly [K in keyof Schema]: CallerNode<LazyDef<Schema[K]>>;
      }) & {
    readonly [$requestStack]: RequestsStack;
    readonly [$methodPath]: string[];
};
type CallerNode<T> =
    T extends JsonRpcMethodSchema<infer P, infer R>
        ? TriggerFunction<P, R>
        : T extends object
          ? JsonRpcCaller<T>
          : never;

type RpcWait = {
    request: JsonRpcRequest;
    promise: PromiseWithResolvers<JsonRpcResponse<any> | void>;
};

export class JsonRpcClient<Schema extends AnySchemaShape> {
    readonly #schema?: JsonRpcSchema;
    readonly #postRpc: PostRpc;
    readonly #postBatch: PostRpc;
    readonly [$generateId]: GenereteId;

    constructor(options: JsonRpcClientOptions<Schema>) {
        this.#schema = options.schema;
        this.#postRpc = options.post;
        this.#postBatch = options.batch ?? options.post;
        this[$generateId] =
            options.generateId ?? JsonRpcClient.defaultIdGenerator;
    }

    static async defaultIdGenerator() {
        return crypto.randomUUID();
    }

    async postRpc(request: JsonRpcRequest) {
        const response = await this.#postRpc(stringifyStream(request));
        const streamJson = await JsonStreamingParser.readFrom(response).root();
        const result = await streamJson.all();
        if ('error' in result) {
            throw JsonRpcException.deserialize(result.error);
        }
        if (request.id == null) return;
        return result as JsonRpcResponse<any>;
    }

    async postBatch(requests: RpcWait[]) {
        const waits = new Map(
            requests
                .filter(({ request: { id } }) => id != null)
                .map(({ request, promise }) => [
                    request.id as string,
                    { request, promise },
                ]),
        );
        const noWaits = new Set(
            requests.filter(({ request: { id } }) => id == null),
        );

        try {
            const requestList = requests.map(({ request: r }) => r);
            const response = await this.#postBatch(
                stringifyStream(requestList),
            );
            const streamJson =
                await JsonStreamingParser.readFrom(response).root();
            if (streamJson instanceof ParsingJsonArray) {
                const results = [] as JsonRpcResponse<any>[];
                for await (const responseStream of streamJson) {
                    const res: JsonRpcResponse<any> =
                        (await responseStream.all()) ?? {};
                    results.push(res);

                    const { id, error } = res as any;
                    const { promise } = waits.get(id) ?? {};
                    waits.delete(id);

                    if (!promise) {
                        console.warn('Orphan rpc response.', res);
                        continue;
                    }
                    if (error) {
                        promise.reject(JsonRpcException.deserialize(error));
                        continue;
                    }
                    promise.resolve(res);
                }
                return results;
            }

            const singleResult = await streamJson.all();
            const { id, error } = singleResult ?? {};
            if (id != null) {
                const { promise } = waits.get(id) ?? {};
                if (promise) {
                    if (error) {
                        promise.reject(JsonRpcException.deserialize(error));
                    } else {
                        promise.resolve(singleResult);
                    }
                } else {
                    console.warn('Orphan rpc response.', singleResult);
                }
                return [singleResult];
            }

            const exceptin = error
                ? JsonRpcException.deserialize(error)
                : new ClientUncaughtError('Unexpected response.', singleResult);
            for (const { promise } of waits.values()) promise.reject(exceptin);
            for (const { promise } of noWaits) promise.reject(exceptin);
            noWaits.clear();
            return [];
        } catch (e) {
            console.error(e);
            throw e;
        } finally {
            for (const { promise, request } of waits.values()) {
                promise.reject(
                    new ClientUncaughtError('Orphan rpc request.', request),
                );
            }
            noWaits.forEach(({ promise }) => {
                promise.resolve();
            });
        }
    }

    #proxy(stack: RequestsStack): JsonRpcCaller<Schema> {
        return this.#schema
            ? proxyRpc(stack, this.#schema)
            : proxyPathRpc(stack);
    }

    #rpc?: JsonRpcCaller<Schema>;
    get rpc(): JsonRpcCaller<Schema> {
        return (this.#rpc ??= this.#proxy(new NoStack(this)));
    }

    #batch?: JsonRpcCaller<Schema>;
    get batch(): JsonRpcCaller<Schema> {
        return (this.#batch ??= this.#proxy(new BatchStack(this)));
    }
    kickBatch() {
        return (this.batch[$requestStack] as BatchStack).kick();
    }

    lazy(delayMs: number = 0): JsonRpcCaller<Schema> {
        return this.#proxy(new LazyStack(this, delayMs));
    }
}

abstract class RequestsStack {
    abstract stack(
        id: boolean,
        method: string[],
        params: any,
    ): Promise<JsonRpcResponse<any> | void>;

    constructor(readonly client: JsonRpcClient<any>) {}
    async buildRequest(
        requireId: boolean,
        methodPath: string[],
        params: any,
    ): Promise<JsonRpcRequest> {
        const jsonrpc = '2.0' as const;
        const method = methodPath.join('.');
        const id = requireId ? await this.client[$generateId]() : null;
        return id
            ? { jsonrpc, id, method, params }
            : { jsonrpc, method, params };
    }
}

class NoStack extends RequestsStack {
    async stack(requireId: boolean, methodPath: string[], params: any) {
        const request = await this.buildRequest(requireId, methodPath, params);
        return this.client.postRpc(request);
    }
}

class BatchStack extends RequestsStack {
    #requests: Promise<RpcWait>[] = [];
    get currentSize() {
        return this.#requests.length;
    }

    stack(requireId: boolean, methodPath: string[], params: any) {
        const resolver = new LazyResolvers<JsonRpcResponse<any> | void>();
        const wait = this.buildRequest(requireId, methodPath, params).then(
            (request) => ({ request, promise: resolver }),
        );
        this.#requests.push(wait);
        return resolver.promise;
    }

    async kick() {
        if (!this.#requests.length) return [];
        const requestsPromises = this.#requests;
        this.#requests = [];
        const requests = await Promise.all(requestsPromises);
        return this.client.postBatch(requests);
    }
}

class LazyStack extends BatchStack {
    constructor(
        client: JsonRpcClient<any>,
        readonly delayMs: number,
    ) {
        super(client);
    }

    stack(requireId: boolean, methodPath: string[], params: any) {
        if (!this.currentSize) {
            setTimeout(() => this.kick(), this.delayMs);
        }
        return super.stack(requireId, methodPath, params);
    }
}

function proxyRpc(
    stack: RequestsStack,
    schema: JsonRpcSchema,
    methodPath: string[] = [],
): any {
    type Property = TriggerFunction<any, any> | JsonRpcCaller<any> | undefined;
    const pickProperty = (key: string): Property => {
        const route = schema[key];
        if (!route) return undefined;
        const path = [...methodPath, key];
        if ('$params' in route || '$return' in route) {
            const fn = triggerFunction(
                stack,
                route as JsonRpcMethodSchema<any, any>,
                path,
            );
            return fn;
        }
        return proxyRpc(
            stack,
            route as JsonRpcSchema,
            path,
        ) as JsonRpcCaller<any>;
    };

    const cache = { [$requestStack]: stack } as Record<string, Property>;
    return new Proxy(schema as any, {
        get(_, key: string) {
            return (cache[key] ??= pickProperty(key));
        },
    });
}

/**
 * スキーマ値を持たない純パスビルダ Proxy。
 * プロパティアクセスでメソッドパスを積み、呼び出しで送信する。実行時検証は行わない。
 * - 単一引数が配列以外のオブジェクトの場合は by-name (params オブジェクト) として送信
 * - それ以外は by-position (params 配列) として送信
 */
function proxyPathRpc(stack: RequestsStack, methodPath: string[] = []): any {
    const cache = {} as Record<string, any>;
    const trigger = pathTriggerFunction(stack, methodPath);
    return new Proxy(trigger, {
        get(target, key) {
            if (key === $requestStack) return stack;
            if (key === $methodPath) return methodPath;
            // await 誤爆 (thenable 判定) や JSON.stringify を子パス化しない
            if (typeof key !== 'string' || key === 'then' || key === 'toJSON')
                return Reflect.get(target, key);
            if (key === 'notice') return target.notice;
            return (cache[key] ??= proxyPathRpc(stack, [...methodPath, key]));
        },
    });
}

function pathTriggerFunction(
    stack: RequestsStack,
    methodPath: string[],
): TriggerFunction<any, any> {
    const normalizeParams = (params: any[]) =>
        params.length === 1 &&
        params[0] !== null &&
        typeof params[0] === 'object' &&
        !Array.isArray(params[0])
            ? params[0]
            : params;
    const assertPath = () => {
        if (!methodPath.length)
            throw new ClientUncaughtError('Method path is empty.', null);
    };
    const fn = async (...params: any[]) => {
        assertPath();
        const response =
            (await stack.stack(true, methodPath, normalizeParams(params))) ??
            ({} as JsonRpcResponse<any>);
        if ('error' in response) {
            throw JsonRpcException.deserialize(response.error);
        }
        return (response as any).result;
    };
    fn.notice = (...params: any[]) => {
        assertPath();
        stack.stack(false, methodPath, normalizeParams(params));
    };
    return fn as TriggerFunction<any, any>;
}

function triggerFunction<Sch extends JsonRpcMethodSchema<any, any>>(
    stack: RequestsStack,
    schema: Sch,
    methodPath: string[],
): TriggerFunction<Sch['$params'], Sch['$return']> {
    const validator = new JsonRpcValidator(schema);
    const validateParams = (params: any[]) => {
        if (schema.$params?.type === 'object') {
            if (params instanceof Array && params.length === 1) {
                validator.validateParams(params[0]);
                return params[0];
            } else {
                throw new InvalidParams(
                    'Expected params to be an object but received multiple parameters.',
                );
            }
        }
        validator.validateParams(params);
        return params;
    };

    const fn = async (...params: any[]) => {
        params = validateParams(params);
        const response =
            (await stack.stack(true, methodPath, params)) ??
            ({} as JsonRpcResponse<any>);
        if ('error' in response) {
            throw JsonRpcException.deserialize(response.error);
        }
        validator.validateReturn(response.result);
        return response.result;
    };
    fn.notice = (...params: any[]) => {
        params = validateParams(params);
        stack.stack(false, methodPath, params);
    };
    return fn;
}
