import { LazyResolvers } from "@xxxaz/stream-api-json/utility";
import { JsonRpcException, MethodNotFound, InternalError, InvalidRequest } from "../JsonRpcException.js";
import { JsonRpcMethodDefinition } from "../JsonRpcMethod.js";
import { type JsonRpcRouter } from "../router/JsonRpcRouter.js";
import { type JsonRpcRequest, type JsonRpcResponse } from "../types.js";
import { JsonRpcValidator } from "../JsonRpcValidator.js";

type MethodDef<Context> = JsonRpcMethodDefinition<Context, any, any>;

export class JsonRpcServer<Context> {
    constructor(readonly router: JsonRpcRouter<Context>) {
    }

    private validateRequest(request: JsonRpcRequest): void {
        const { jsonrpc, method, params } = request;
        if(jsonrpc as string !== '2.0') throw new InvalidRequest('jsonrpc must be "2.0"');
        if(!method) throw new InvalidRequest('method is required.');
    }

    private async pickMethodDefine(methodPath: string): Promise<MethodDef<Context>> {
        const picked = await this.router.resolve(methodPath) as MethodDef<Context>|null;
        if (!picked) {
            throw new MethodNotFound(`Definition of method ${methodPath} is not Found.`);
        }
        const methodKey = (picked.constructor as typeof JsonRpcMethodDefinition).method as keyof MethodDef<Context>;
        if (picked[methodKey] instanceof Function) {
            return picked;
        }
        throw new MethodNotFound(`Definition ${methodPath} dose not have method.`);
    }

    private async execute(ctx: Context, request: JsonRpcRequest) {
        try {
            this.validateRequest(request);
            const { method, params } = request;

            const picked = await this.pickMethodDefine(method);
            const validator = new JsonRpcValidator(picked);

            validator.validateParams(params);
            const result = await picked.$apply(ctx, params);
            try {
                validator.validateReturn(result);
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

    async * batch(ctx: Context, requests: AsyncIterable<JsonRpcRequest>|Iterable<JsonRpcRequest>) {
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
