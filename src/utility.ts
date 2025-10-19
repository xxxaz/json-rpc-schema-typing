import { type JsonSerializable } from "@xxxaz/stream-api-json";
import { JsonRpcRequest, JsonRpcResponse } from "./types.js";

export function toStream<T>(src: T) {
    return new ReadableStream<T>({
        start(controller) {
            controller.enqueue(src);
            controller.close();
        }
    });
}

export function stringifyStream(json: JsonSerializable) {
    return toStream(JSON.stringify(json));
}

export function emptyStrem() {
    return new ReadableStream({ start: c => c.close() });
}

export async function readStreamAll(stream: ReadableStream<string|ArrayBuffer>) : Promise<Blob> {
    const reader = stream.getReader();
    const result = [] as (ArrayBuffer|string)[];
    while (true) {
        const { done, value } = await reader.read();
        if (value) result.push(value);
        if (done) break;
    }
    return new Blob(result);
}

export function isRpcRequest(data: any): data is JsonRpcRequest {
    return (
        data instanceof Object
        &&
        data.jsonrpc === '2.0'
        &&
        typeof data.method === 'string'
    );
}

export function isRpcResponse(data: any): data is JsonRpcResponse<any> {
    return (
        data instanceof Object
        &&
        data.jsonrpc === '2.0'
        &&
        (
            'id' in data
            ||
            'error' in data
        )
    );
}
