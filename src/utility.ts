import { Serializable } from "@xxxaz/stream-api-json/types";

export function toStream<T>(src: T) {
    return new ReadableStream<T>({
        start(controller) {
            controller.enqueue(src);
            controller.close();
        }
    });
}

export function stringifyStream(json: Serializable) {
    return toStream(JSON.stringify(json));
}

export function emptyStrem() {
    return new ReadableStream({ start: c => c.close() });
}

export async function readStreamAll(stream: ReadableStream<string|Uint8Array>) : Promise<Blob> {
    const reader = stream.getReader();
    const result = [] as (Uint8Array|string)[];
    while (true) {
        const { done, value } = await reader.read();
        if (value) result.push(value);
        if (done) break;
    }
    return new Blob(result);
}