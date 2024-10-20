import { IncomingMessage, ServerResponse } from 'http';
import { JsonStreamingParser, ParsingJson, ParsingJsonArray, ParsingJsonTypes, StringifyingJsonArray, toNodeReadable  } from '@xxxaz/stream-api-json';
import { JsonRpcServer } from '../JsonRpcServer.js';
import { JsonRpcRequest } from '../types.js';
import { InternalError, JsonRpcException } from '../JsonRpcException.js';

type HttpServeOptions = {
    requestConverter?: (request: IncomingMessage) => AsyncIterable<string>;
    responseConverter?: (response: ReadableStream) => ReadableStream;
};

export async function serveHttp<Ctx>(server: JsonRpcServer<Ctx>, context: Ctx, request: IncomingMessage, response: ServerResponse, options: HttpServeOptions = {}): Promise<void> {
    const { requestConverter, responseConverter } = options;
    try {
        const root = await JsonStreamingParser
            .readFrom(
                requestConverter ? requestConverter(request) : request
            )
            .root();

        const { status, stream } = await invoke<Ctx>(root, server, context);

        const nodeStream = await toNodeReadable(
            responseConverter ? responseConverter(stream) : stream
        );
        response.writeHead(status, {
            'Content-Type': 'application/json',
            'Transfer-Encoding': 'chunked'
        })
        nodeStream.pipe(response);

    } catch (err: unknown) {
        response.writeHead(500);
        response.end(JSON.stringify({ jsonrpc: "2.0", error: new InternalError(String(err)).serialize() }));
    }
}

async function invoke<Ctx>(req: ParsingJsonTypes, server: JsonRpcServer<Ctx>, context: Ctx) {
    try {
        if(req instanceof ParsingJsonArray) {
            const result = server.batch(context, extract(req));
            const stream = new StringifyingJsonArray(result);
            return { status: 200, stream };
        } else {
            const result = await server.call(context, await req.all());
            const stream = new Blob([JSON.stringify(result)]).stream();
            return { status: 200, stream };
        }
    } catch (err: unknown) {
        if(err instanceof JsonRpcException) {
            const status = err instanceof InternalError ? 500 : 400;
            const result = { jsonrpc: "2.0", error: err.serialize() };
            const stream = new Blob([JSON.stringify(result)]).stream();
            return { status, stream };
        }
        throw err;
    }
}

async function * extract(srcArray: AsyncIterable<any>, converter?: (request: any) => any): AsyncGenerator<JsonRpcRequest, void, undefined> {
    for await (const req of srcArray) {
        const loaded = (req instanceof ParsingJson) ? await req.all() : req;
        yield converter ? converter(loaded) : loaded;
    }
}