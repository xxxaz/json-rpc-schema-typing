import { JsonStreamingParser, responseToTextStream, StringifyingJsonArray } from "@xxxaz/stream-api-json";
import { LazyResolvers } from "@xxxaz/stream-api-json/utility";
import { ClientHttpError } from "../JsonRpcException.js";
import { JsonRpcSchema } from "../router/JsonRpcRouter.js";
import { GenereteId, JsonRpcClient } from "./JsonRpcClient.js";
import { emptyStrem, isRpcRequest, isRpcResponse, readStreamAll } from "../utility.js";
import { JsonRpcRequest, JsonRpcResponse, MessageInput, MessageOutput } from "../types.js";

type JsonRpcMessagePortClientOptions<Sch extends JsonRpcSchema> = {
    schema: Sch;
    generateId?: GenereteId;
    targetOrigin?: string;
} & ({
    input: MessageInput;
    output: MessageOutput;
    port?: undefined;
}|{
    input?: undefined;
    output?: undefined;
    port: MessageInput & MessageOutput;
});

type ProccessedMessage = {
    request: JsonRpcRequest;
    resolver: LazyResolvers<JsonRpcResponse<any>>;
};

export class JsonRpcMessagePortClient<Sch extends JsonRpcSchema> extends JsonRpcClient<Sch> {
    readonly #targetOrigin: string;
    readonly #input: MessageInput;
    readonly #output: MessageOutput;

    constructor(options: JsonRpcMessagePortClientOptions<Sch>) {
        const { schema, generateId } = options;
        super({
            schema,
            generateId,
            post: (request) => this.#request(request),
        });

        this.#input = options.port ?? options.input;
        this.#output = options.port ?? options.output;
        this.#targetOrigin = options.targetOrigin ?? globalThis.origin ?? '*';

        this.#input.addEventListener('message', this.#receive.bind(this));
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
                controller.enqueue('[');
                while(promises.size > 0) {
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
        let resolver: LazyResolvers<JsonRpcResponse<any>>|null = null;
        if (request.id != null) {
            resolver = new LazyResolvers<JsonRpcResponse<any>>();
            this.#pool.set(request.id, { request, resolver });
        }

        if(this.#output instanceof Window) {
            this.#output.postMessage(request, this.#targetOrigin);
        } else {
            this.#output.postMessage(request);
        }

        return resolver?.promise ?? null;
    }

    async #receive(event: MessageEvent) {
        if (event.source && event.source !== this.#output) return;
        const data = JSON.parse(event.data);
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

}