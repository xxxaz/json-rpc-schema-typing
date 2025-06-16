import { responseToTextStream } from "@xxxaz/stream-api-json/helpers-browser";
import { ClientHttpError } from "../JsonRpcException.js";
import { JsonRpcSchema } from "../router/JsonRpcRouter.js";
import { GenereteId, JsonRpcClient } from "./JsonRpcClient.js";
import { emptyStrem, readStreamAll } from "../utility.js";

type HeadersGenerator = (body: Blob) => Promise<HeadersInit>|HeadersInit;

type JsonRpcHttpClientOptions<Sch extends JsonRpcSchema> = {
    schema: Sch;
    generateId?: GenereteId;
    postUrl: string|URL;
    batchUrl?: string|URL;
    requestConverter?: (request: ReadableStream<string>) => ReadableStream<Uint8Array>;
    responseConverter?: (response: ReadableStream<Uint8Array>, contentType: string|null) => ReadableStream<string>;
    headers?: HeadersGenerator|HeadersInit;
    init?: Pick<RequestInit, 'credentials'|'keepalive'|'mode'|'priority'|'redirect'|'referrer'|'referrerPolicy'>;
};

export class JsonRpcHttpClient<Sch extends JsonRpcSchema> extends JsonRpcClient<Sch> {

    constructor(options: JsonRpcHttpClientOptions<Sch>) {
        const { schema, generateId, postUrl, batchUrl } = options;
        super({
            schema,
            generateId,
            post: (request) => this.#post(postUrl, request),
            batch: (request) => this.#post(batchUrl ?? postUrl, request),
        });
        this.postUrl = postUrl;
        this.batchUrl = batchUrl ?? postUrl;

        this.#requestConverter = options.requestConverter;
        this.#responseConverter = options.responseConverter;
        this.#initGenerator = async (body) => {
            const init = options.headers;
            const headers = (typeof init === 'function')
                ? new Headers(await init(body))
                : new Headers(init);
            if (!headers.has('Content-Type')) {
                headers.set('Content-Type', 'application/json');
            }
            return {
                ...options.init,
                method: 'POST',
                headers,
            };
        };
    }

    readonly postUrl: string|URL;
    readonly batchUrl: string|URL;
    readonly #requestConverter?: (request: ReadableStream<string>) => ReadableStream<any>;
    readonly #responseConverter?: (response: ReadableStream<any>, contentType: string|null) => ReadableStream<string>;
    readonly #initGenerator: (body: Blob) => Promise<RequestInit>;

    async #post(url: string|URL, request: ReadableStream<string>) {
        if (this.#requestConverter) request = this.#requestConverter(request);
        const body = await readStreamAll(request);
        const init = await this.#initGenerator(body);
        const response = await fetch(url, { ...init, body });
        if (!response.ok) {
            const message = `${response.status} ${response.statusText}`;
            const headers = Object.fromEntries(response.headers.entries());
            console.warn(new ClientHttpError(message, { headers }));
        }
        return this.#responseConverter
            ? this.#responseConverter(response.body ?? emptyStrem(), response.headers.get('Content-Type'))
            : responseToTextStream(response);
    }
}