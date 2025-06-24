import { JsonStreamingParser, ParsingJsonArray } from '@xxxaz/stream-api-json';
import { ClientUncaughtError, InvalidParams, JsonRpcException } from "../JsonRpcException.js";
import { JsonRpcMethodSchema, ParameterSchema, Params, Return } from "../JsonRpcMethod.js";
import { JsonRpcValidator } from "../JsonRpcValidator.js";
import { type JsonRpcSchema } from "../router/JsonRpcRouter.js";
import { JsonRpcRequest, JsonRpcResponse } from "../types.js";
import { LazyResolvers } from '@xxxaz/stream-api-json/utility';
import { stringifyStream } from '../utility.js';


type PostRpc = (request: ReadableStream<string>) => Promise<ReadableStream<string>>;
export type GenereteId = () => Promise<string|number>;

type JsonRpcClientOptions<Sch extends JsonRpcSchema> = {
    schema: Sch;
    post: PostRpc;
    batch?: PostRpc;
    generateId?: GenereteId;
};

const $generateId: unique symbol = Symbol('GenereteId');
const $requestStack: unique symbol = Symbol('RequestsStack');
const $methodPath: unique symbol = Symbol('MethodPath');

type TriggerFunction<ParamSch extends ParameterSchema, RtnSch> = {
    (...args: Params<ParamSch>): Promise<Return<RtnSch>>;
    notice(...args: Params<ParamSch>): void;
};

type JsonRpcCaller<Schema extends JsonRpcSchema> = {
    readonly [K in keyof Schema]
        : Schema[K] extends JsonRpcMethodSchema<infer P, infer R>
            ? TriggerFunction<P, R>
        : Schema[K] extends JsonRpcSchema
            ? JsonRpcCaller<Schema[K]>
        : never;
} & { 
    readonly [$requestStack]: RequestsStack;
    readonly [$methodPath]: string[];
};

type RpcWait = {
    request: JsonRpcRequest;
    promise: PromiseWithResolvers<JsonRpcResponse<any>|void>;
};

export class JsonRpcClient<Schema extends JsonRpcSchema> {
    readonly #schema: Schema;
    readonly #postRpc: PostRpc;
    readonly #postBatch: PostRpc;
    readonly [$generateId]: GenereteId;

    constructor(options: JsonRpcClientOptions<Schema>) {
        this.#schema = options.schema;
        this.#postRpc = options.post;
        this.#postBatch = options.batch ?? options.post;
        this[$generateId] = options.generateId ?? JsonRpcClient.defaultIdGenerator;
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
                .map(({ request, promise }) => [request.id as string, { request, promise }])
        );
        const noWaits = new Set(requests.filter(({ request: { id } }) => id == null));

        try {
            const requestList = requests.map(({ request: r }) => r);
            const response = await this.#postBatch(stringifyStream(requestList));
            const streamJson = await JsonStreamingParser.readFrom(response).root();
            if (streamJson instanceof ParsingJsonArray) {
                const results = [] as JsonRpcResponse<any>[];
                for await (const responseStream of streamJson) {
                    const res: JsonRpcResponse<any> = await responseStream.all() ?? {};
                    results.push(res);
    
                    const { id, error } = res as any;
                    const { promise } = waits.get(id) ?? {};
                    waits.delete(id);
    
                    if (!promise) {
                        console.warn('Orphan rpc response.', res)
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
            for(const { promise, request } of waits.values()) {
                promise.reject(new ClientUncaughtError('Orphan rpc request.', request));
            }
            noWaits.forEach(({ promise }) => promise.resolve());
        }
    }

    #rpc?: JsonRpcCaller<Schema>;
    get rpc(): JsonRpcCaller<Schema> {
        return this.#rpc ??= getChild(this.#schema, [], new NoStack(this));
    }
    
    #batch?: JsonRpcCaller<Schema>;
    get batch(): JsonRpcCaller<Schema> {
        return this.#batch ??= getChild(this.#schema, [], new BatchStack(this));
    }
    kickBatch() {
        return (this.batch[$requestStack] as BatchStack).kick();
    }

    lazy(delayMs: number = 0): JsonRpcCaller<Schema> {
        return getChild(this.#schema, [], new LazyStack(this, delayMs));
    }
}

abstract class RequestsStack {
    abstract stack(id: boolean, method: string[], params: any): Promise<JsonRpcResponse<any>|void>;

    constructor(readonly client: JsonRpcClient<any>) {}
    protected async buildRequest(requireId: boolean, methodPath: string[], params: any) : Promise<JsonRpcRequest> {
        const jsonrpc = '2.0' as const;
        const method = methodPath.join('.');
        const id = requireId ? await this.client[$generateId]() : null;
        return id ? { jsonrpc, id, method, params }: { jsonrpc, method, params };
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
        const resolver = new LazyResolvers<JsonRpcResponse<any>|void>();
        const wait
            = this.buildRequest(requireId, methodPath, params)
            .then((request)=> ({ request, promise: resolver }));
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
    constructor(client: JsonRpcClient<any>, readonly delayMs: number) {
        super(client);
    }

    stack(requireId: boolean, methodPath: string[], params: any) {
        if (!this.currentSize) {
            setTimeout(() => this.kick(), this.delayMs);
        }
        return super.stack(requireId, methodPath, params);
    }
}

function getChild<Sch extends JsonRpcSchema>(schema: Sch, methodPath: string[], stack: RequestsStack) : JsonRpcCaller<Sch> {
    const cache = { [$requestStack]: stack } as Record<string, TriggerFunction<any, any>|JsonRpcCaller<any>>;
    return new Proxy(cache as any, {
        get(_, key: string) {
            if (cache[key]) return cache[key];
            const route = schema[key];
            if(!route) return undefined;
            const path = [...methodPath, key];
            if('$params' in route || '$return' in route) {
                const fn = triggerFunction(route as JsonRpcMethodSchema<any, any>, path, stack);
                return cache[key] = fn;
            }
            const child = getChild(route as JsonRpcSchema, path, stack);
            return cache[key] = child;
        }
    });
}


function triggerFunction<Sch extends JsonRpcMethodSchema<any, any>>(schema: Sch, methodPath: string[], stack: RequestsStack) : TriggerFunction<Sch['$params'], Sch['$return']> {
    const validator = new JsonRpcValidator(schema);
    const validateParams = (params: any[]) => {
        if(schema.$params?.type === 'object') {
            if (params instanceof Array && params.length === 1) {
                validator.validateParams(params[0]);
                return params[0];
            } else {
                throw new InvalidParams('Expected params to be an object but received multiple parameters.');
            }
        }
        validator.validateParams(params);
        return params;
    };

    const fn = async (...params: any[]) => {
        params = validateParams(params);
        const response = await stack.stack(true, methodPath, params) ?? {} as JsonRpcResponse<any>;
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