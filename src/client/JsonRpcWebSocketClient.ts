import { LazyResolvers } from "@xxxaz/stream-api-json/utility";
import { type JsonSerializable } from "@xxxaz/stream-api-json";
import { JsonRpcSchema } from "../router/JsonRpcRouter.js";
import { GenereteId, JsonRpcClient } from "./JsonRpcClient.js";
import { isRpcResponse, readStreamAll } from "../utility.js";
import { JsonRpcError, JsonRpcRequest, JsonRpcResponse } from "../types.js";
import { WebSocketWrapper, WrapableWebSocket, wrapWebSocket } from '../WebSocketWrapper.js';

type JsonRpcWebSocketClientOptions<Sch extends JsonRpcSchema, Skt extends WrapableWebSocket> = {
    schema: Sch;
    socket: Skt;
    generateId?: GenereteId;
};

type ProccessedMessage = {
    request: JsonRpcRequest;
    resolver: LazyResolvers<JsonRpcResponse<any>>;
};

export class JsonRpcWebSocketClient<Sch extends JsonRpcSchema, Skt extends WrapableWebSocket> extends JsonRpcClient<Sch> {
    readonly #socket: WebSocketWrapper;

    constructor(options: JsonRpcWebSocketClientOptions<Sch, Skt>) {
        const { schema, generateId } = options;
        super({
            schema,
            generateId,
            post: (request) => this.#request(request),
        });
        this.#socket = wrapWebSocket(
            options.socket,
            this.#receive.bind(this),
            (close) => {
                console.debug('socket closed', close);
                const { code, reason, wasClean } = close;
                this.rejectAll({
                    code: -32000,
                    message: 'Connection closed',
                    data: { code, reason, wasClean } as JsonSerializable,
                });
            }
        );
    }

    get available() {
        const { CLOSING, CLOSED } = WebSocket;
        const state = this.#socket.readyState;
        return state !== CLOSING && state !== CLOSED;
    }

    async #request(stream: ReadableStream<string>) {
        const blob = await readStreamAll(stream);
        const request = JSON.parse(await blob.text());
        if (request instanceof Array) {
            return this.#batch(request);
        }

        const response = await this.#post(request);
        return new ReadableStream({
            async start(controller) {
                if (response) {
                    controller.enqueue(JSON.stringify(response));
                }
                controller.close();
            }
        });
    }

    async #batch(requests: JsonRpcRequest[]) {
        const entries = requests
            .map(req => [ req.id!, this.#post(req)! ] as const)
            .filter(([ id, promise ]) => promise)
        const promises = new Map(entries);

        return new ReadableStream({
            async start(controller) {
                const initialCount = promises.size;
                controller.enqueue('[');
                while(promises.size > 0) {
                    if (promises.size < initialCount) {
                        controller.enqueue(',');
                    }
                    const response = await Promise.race(promises.values());
                    controller.enqueue(JSON.stringify(response));
                    promises.delete(response.id!);
                }
                controller.enqueue(']');
                controller.close();
            }
        });
    };

    readonly #pool = new Map<number|string, ProccessedMessage>();
    #post(request: JsonRpcRequest) {
        if (!this.available) {
            return Promise.resolve<JsonRpcResponse<any>>({
                jsonrpc: '2.0',
                id: request.id!,
                error: {
                    code: -32000,
                    message: 'Connection is not available',
                    data: null,
                },
            });
        }
        let resolver: LazyResolvers<JsonRpcResponse<any>>|null = null;
        if (request.id != null) {
            resolver = new LazyResolvers<JsonRpcResponse<any>>();
            this.#pool.set(request.id, { request, resolver });
        }
        this.#socket.send(request);
        return resolver?.promise ?? null;
    }

    async #receive(data: JsonSerializable) {
        if (!isRpcResponse(data)) {
            console.debug('message is not JsonRpcResponse', data);
            return;
        }
        if (data.id == null) {
            console.debug('Reponse message is not Unidentifiable', data);
            return;
        }
        const pooled = this.#pool.get(data.id);
        if (!pooled) {
            console.warn('Orphan rpc response.', data)
            return;
        }
        pooled.resolver.resolve(data);
        this.#pool.delete(data.id);
    }

    rejectAll(reason: JsonRpcError) {
        for (const { request: { id }, resolver } of this.#pool.values()) {
            resolver.resolve({
                jsonrpc: '2.0',
                id: id!,
                error: reason,
            });
        }
        this.#pool.clear();
    }
}