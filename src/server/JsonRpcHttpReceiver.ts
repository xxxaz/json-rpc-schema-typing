import { type IncomingMessage as Http1ServerRequest, type OutgoingHttpHeaders as OutgoingHttp1Headers, type ServerResponse as HttpaServerResponse } from 'http';
import { type Http2ServerRequest, type OutgoingHttpHeaders as OutgoingHttp2Headers, type Http2ServerResponse } from 'http2';
type HttpServerRequest = Http1ServerRequest | Http2ServerRequest;
type HttpServerResponse = HttpaServerResponse | Http2ServerResponse;
type OutgoingHttpHeaders = OutgoingHttp1Headers | OutgoingHttp2Headers;

import { Readable } from 'stream';
import { JsonStreamingParser, ParsingJsonArray, ParsingJsonTypes, StringifyingJsonArray } from '@xxxaz/stream-api-json';
import { JsonRpcServer } from './JsonRpcServer.js';
import { InternalError, JsonRpcException } from '../JsonRpcException.js';
import { JsonRpcRouter } from '../router/JsonRpcRouter.js';
import { stringifyStream } from '../utility.js';

type HttpServeOptions = {
    requestConverter?: (request: ReadableStream<string|Uint8Array>) => ReadableStream<string>;
    responseConverter?: (response: ReadableStream<string>) => ReadableStream<Uint8Array|string>;
    headers?: OutgoingHttpHeaders;
};

export class JsonRpcHttpReceiver<Ctx> extends JsonRpcServer<Ctx> {
    constructor(router: JsonRpcRouter<Ctx>, options: HttpServeOptions = {}) {
        super(router);
        this.#requestConverter = options.requestConverter;
        this.#responseConverter = options.responseConverter;
        this.#headers = {
            'Content-Type': 'application/json',
            ...options.headers,
            'Transfer-Encoding': 'chunked',
        };
    }
    readonly #requestConverter?: (request: ReadableStream<string|Uint8Array>) => ReadableStream<string>;
    readonly #responseConverter?: (response: ReadableStream<string>) => ReadableStream<Uint8Array|string>;
    readonly #headers: OutgoingHttpHeaders;

    #convertRequesrt(request: HttpServerRequest) {
        if (!this.#requestConverter) return request;
        const stream = new ReadableStream({
            start(controller) {
                request.on('error', (error) => controller.error(error));
                request.on('data', (chunk) => controller.enqueue(chunk));
                request.on('end', () => controller.close());
            }
        });
        return this.#requestConverter(stream);
    }

    #convertResponse(response: ReadableStream<string>) {
        if (!this.#responseConverter) return response;
        return this.#responseConverter(response);
    }

    async serve(context: Ctx, request: HttpServerRequest, response: HttpServerResponse): Promise<void> {
        try {
            const root = await JsonStreamingParser
                .readFrom(this.#convertRequesrt(request))
                .root();
            const { status, stream } = await this.#invoke(context, root);
            const nodeStream = toNodeReadable(this.#convertResponse(stream));
            response.writeHead(status, this.#headers);
            nodeStream.pipe(response);
    
        } catch (err: unknown) {
            response.writeHead(500);
            response.end(JSON.stringify({ jsonrpc: "2.0", error: new InternalError(String(err)).serialize() }));
        }
    }

    async #invoke(context: Ctx, req: ParsingJsonTypes) {
        try {
            if(req instanceof ParsingJsonArray) {
                async function * iterateReq() {
                    for await (const m of req as ParsingJsonArray<any>) {
                        yield await m.all();
                    }
                }
                const result = this.batch(context, iterateReq());
                const stream = new StringifyingJsonArray(result);
                return { status: 200, stream };
            } else {
                const result = await this.call(context, await req.all());
                return { status: 200, stream: stringifyStream(result) };
            }
        } catch (err: unknown) {
            if(err instanceof JsonRpcException) {
                const status = err instanceof InternalError ? 500 : 400;
                const result = { jsonrpc: "2.0", error: err.serialize() };
                return { status, stream: stringifyStream(result) };
            }
            throw err;
        }
    }
}

export function toNodeReadable<T>(source: ReadableStream<T>) : Readable {
    const reader = source.getReader();
    return new Readable({
        async destroy(error, callback) {
            if (error) await reader.cancel(error);
            callback(error);
        },
        async read() {
            const { done, value } = await reader.read();
            if (done) {
                this.push(null);
            } else {
                this.push(value);
            }
        }
    });
}
