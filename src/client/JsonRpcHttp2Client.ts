import http2, { OutgoingHttpHeaders } from 'http2';
import { ClientHttpError } from "../JsonRpcException.js";
import { JsonRpcSchema } from "../router/JsonRpcRouter.js";
import { GenereteId, JsonRpcClient } from "./JsonRpcClient.js";
import { readStreamAll } from "../utility.js";

type HeadersGenerator = (body: Blob) => Promise<HeadersInit>|HeadersInit;

type JsonRpcHttpClientOptions<Sch extends JsonRpcSchema> = {
    schema: Sch;
    generateId?: GenereteId;
    postUrl: string|URL;
    batchUrl?: string|URL;
    requestConverter?: (request: ReadableStream<string>) => ReadableStream<Uint8Array>;
    responseConverter?: (response: ReadableStream<Uint8Array>, contentType: string|null) => ReadableStream<string>;
    headers?: HeadersGenerator|HeadersInit;
    init?: OutgoingHttpHeaders;
};

export class JsonRpcHttp2Client<Sch extends JsonRpcSchema> extends JsonRpcClient<Sch> {

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
                ...Object.fromEntries(headers.entries()),
            };
        };
    }

    readonly postUrl: string|URL;
    readonly batchUrl: string|URL;
    readonly #requestConverter?: (request: ReadableStream<string>) => ReadableStream<any>;
    readonly #responseConverter?: (response: ReadableStream<any>, contentType: string|null) => ReadableStream<string>;
    readonly #initGenerator: (body: Blob) => Promise<OutgoingHttpHeaders>;

    async #post(url: string|URL, request: ReadableStream<string>) {
        if (this.#requestConverter) request = this.#requestConverter(request);
        url = new URL(url);
        const body = await readStreamAll(request);
        const init = await this.#initGenerator(body);

        const client = http2.connect(url.origin, {
            protocol: url.protocol === 'http:' ? 'http:' : undefined,
        });
        const clientError = new Promise<void>((_, reject) => {
            client.on('error', (err) => reject(err));
        });

        const {
            HTTP2_HEADER_METHOD,
            HTTP2_HEADER_PATH,
            HTTP2_HEADER_STATUS,
        } = http2.constants;

        try{
            const req = client.request({
                ...init,
                [HTTP2_HEADER_METHOD]: 'POST',
                [HTTP2_HEADER_PATH]: url.pathname + url.search,
            });

            const headerPromise = Promise.race([
                new Promise((resolve, reject) => {
                    req.on('error', reject);
                    req.on('response', resolve);
                }),
                clientError,
            ]);

            req.setEncoding('utf8');
            req.write(new Uint8Array(await body.arrayBuffer()));
            req.end();

            const headers = await headerPromise as Record<string, string|string[]>;
            const status = Number(headers[HTTP2_HEADER_STATUS] instanceof Array ? headers[HTTP2_HEADER_STATUS][0] : headers[HTTP2_HEADER_STATUS]);
            if (Math.floor(status / 100) !== 2) {
                const message = `${status} Satus Code is not OK`;
                console.warn(new ClientHttpError(message, { headers }));
            }
            const stream = new ReadableStream({
                start(controller) {
                    req.on('error', (error) => controller.error(error));
                    req.on('data', (chunk) => controller.enqueue(chunk));
                    req.on('end', () => controller.close());
                }
            });
            return this.#responseConverter
                ? this.#responseConverter(stream, headers['content-type'] as string)
                : stream;
        } finally {
            client.close();
        }
    }
}