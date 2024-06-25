import { LazyResolvers } from "@xxxaz/stream-api-json/utility";
import { JsonRpcException, MethodNotFound, InternalError, InvalidRequest } from "./JsonRpcException.js";
import { type JsonRpcMethodDefinition } from "./JsonRpcMethod.js";
import { type JsonRpcRouter } from "./JsonRpcRouter.js";
import { type JsonRpcRequest, type JsonRpcResponse } from "./types.js";

export class JsonRpcServer<Context> {
    constructor(readonly router: JsonRpcRouter<Context>) {
    }

    private validateRequest(request: JsonRpcRequest): void {
        const { jsonrpc, method, params } = request;
        if(jsonrpc as string !== '2.0') throw new InvalidRequest('jsonrpc must be "2.0"');
        if(!method) throw new InvalidRequest('method is required.');
    }

    private pickMethodDefine(methodPath: string): JsonRpcMethodDefinition<Context, any, any> {
        const picked = methodPath.split('.').reduce((route: any, path)=> route?.[path], this.router);
        if (picked?.$schema && picked.method instanceof Function) {
            return picked;
        }
        throw new MethodNotFound(`method ${methodPath} is not Found.`);
    }

    private async execute(ctx: Context, request: JsonRpcRequest) {
        try {
            this.validateRequest(request);
            const { method, params } = request;

            const picked = this.pickMethodDefine(method);
            picked.validateParams(params);
            const result = await picked.apply(ctx, params);
            try {
                picked.validateReturn(result);
            } catch (e) {
                console.warn(`Invalid Result: ${method}`, e);
            }
            return result;
        } catch (err: unknown) {
            console.error(err);
            if(err instanceof JsonRpcException) throw err;
            throw new InternalError(String(err));
        }
    }

    async call(ctx: Context, request: JsonRpcRequest): Promise<JsonRpcResponse<any>> {
        const jsonrpc = '2.0';
        const id = request.id! ?? null;
        try {
            const result = await this.execute(ctx, request);
            return { jsonrpc, id, result };
        } catch (err: unknown) {
            const error = err instanceof JsonRpcException
                ? err.serialize()
                : new InternalError(String(err)).serialize();
            return { jsonrpc, id, error };
        }
    };

    async * batch(ctx: Context, requests: AsyncIterable<JsonRpcRequest>) {
        const promises: { [id: number|string]: Promise<JsonRpcResponse<any>>} = {};
        let loading: LazyResolvers<void> = new LazyResolvers();
        let loadedAll = false;
        (async () => {
            for await (const request of requests) {
                const id = request.id;
                if (id == null) {
                    this.execute(ctx, request);
                    continue;
                }
                promises[id] = this.call(ctx, request);
                loading.resolve();
                loading = new LazyResolvers();
            }
            loadedAll = true;
            loading.resolve();
        })();

        while(true) {
            const list = Object.values(promises);
            if(!list.length) {
                if (loadedAll) break;
                await loading.promise;
                continue;
            }
            const response = await Promise.race(list);
            yield response;
            delete promises[response.id!];
        }
    };

}
