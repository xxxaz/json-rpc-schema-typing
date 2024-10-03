import { IncomingMessage, ServerResponse } from 'http';
import { JsonStreamingParser, ParsingJsonArray, StringifyingJsonArray, toNodeReadable  } from '@xxxaz/stream-api-json';
import { JsonRpcServer } from '../JsonRpcServer.js';
import { JsonRpcRequest } from '../types.js';
import { InternalError, JsonRpcException } from '../JsonRpcException.js';

async function * extract(iterable: ParsingJsonArray<JsonRpcRequest[]>) {
    for await (const req of iterable) {
        yield await req.all();
    }
}

export async function serveHttp<Ctx>(server: JsonRpcServer<Ctx>, context: Ctx, request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
        const root = await JsonStreamingParser
            .readFrom(request)
            .root();
            
        if(root instanceof ParsingJsonArray) {
            const result = server.batch(context, extract(root));
            const source = new StringifyingJsonArray(result);
            const stream = await toNodeReadable(source);
            response.writeHead(200, {
                'Content-Type': 'application/json',
                'Transfer-Encoding': 'chunked'
            })
            stream.pipe(response);
            return;
        }

        const result = await server.call(context, await root.all());
        response.writeHead(200, {
            'Content-Type': 'application/json'
        })
        response.end(JSON.stringify(result));

    } catch (err: unknown) {
        if(err instanceof JsonRpcException) {
            const status = err instanceof InternalError ? 500 : 400;
            response.writeHead(status);
            response.end(JSON.stringify({ jsonrpc: "2.0", error: err.serialize() }));
            return;
        }

        response.writeHead(500);
        response.end(JSON.stringify({ jsonrpc: "2.0", error: new InternalError(String(err)).serialize() }));
    }
}