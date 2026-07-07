import { JsonRpcClient } from '../src/client/JsonRpcClient.js';
import { MethodNotFound } from '../src/JsonRpcException.js';
import {
    $Array,
    $Boolean,
    $Number,
    $Object,
    $String,
    $Tuple,
} from '../src/schemas/index.js';
import type { JsonRpcRequest } from '../src/types.js';

/**
 * schemaless (実行時スキーマ値なし) でも、Schema 型は**必ず** generic で与える。
 * 型は与えつつ実行時には値を渡さない = 純パスビルダ動作 + 静的型安全の両立を検証する。
 */
const testSchema = {
    deeply: {
        nested: {
            namespace: {
                method: {
                    $params: $Object({ foo: $Number }),
                    $return: $String,
                },
            },
        },
    },
    ns: {
        byName: {
            $params: $Object({ house_id: $Number, flag: $Boolean }),
            $return: $String,
        },
    },
    calc: { add: { $params: $Tuple($Number, $Number), $return: $Number } },
    echo: { single: { $params: $Tuple($String), $return: $String } },
    list: { byArray: { $params: $Tuple($Array($Number)), $return: $String } },
    noArgs: { call: { $return: $String } },
    logging: {
        write: { $params: $Object({ message: $String }), $return: $String },
    },
    no: { such: { method: { $return: $String } } },
} as const;

async function readAll(stream: ReadableStream<string>): Promise<string> {
    const reader = stream.getReader();
    let out = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        out += value;
    }
    return out;
}

function streamOf(text: string): ReadableStream<string> {
    return new ReadableStream<string>({
        start(controller) {
            controller.enqueue(text);
            controller.close();
        },
    });
}

function stubClient(respond: (request: JsonRpcRequest) => unknown) {
    const requests: JsonRpcRequest[] = [];
    const client = new JsonRpcClient<typeof testSchema>({
        post: async (stream) => {
            const request = JSON.parse(await readAll(stream)) as JsonRpcRequest;
            requests.push(request);
            return streamOf(JSON.stringify(respond(request)));
        },
    });
    return { client, requests };
}

describe('schemaless client (パスビルダ)', () => {
    test('.rpc.ns.method(...) がパス通りの method で送信される', async () => {
        const { client, requests } = stubClient(({ id }) => ({
            jsonrpc: '2.0',
            id,
            result: 'ok',
        }));

        const result = await client.rpc.deeply.nested.namespace.method({
            foo: 1,
        });

        expect(result).toBe('ok');
        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('deeply.nested.namespace.method');
        expect(requests[0].id).toBeTruthy();
    });

    test('単一オブジェクト引数は by-name (params オブジェクト) として送信される', async () => {
        const { client, requests } = stubClient(({ id }) => ({
            jsonrpc: '2.0',
            id,
            result: null,
        }));

        await client.rpc.ns.byName({ house_id: 1, flag: true });

        expect(requests[0].params).toEqual({ house_id: 1, flag: true });
    });

    test('複数引数・非オブジェクト引数は by-position (params 配列) として送信される', async () => {
        const { client, requests } = stubClient(({ id }) => ({
            jsonrpc: '2.0',
            id,
            result: null,
        }));

        await client.rpc.calc.add(1, 2);
        await client.rpc.echo.single('text');
        await client.rpc.list.byArray([1, 2, 3]);
        await client.rpc.noArgs.call();

        expect(requests[0].params).toEqual([1, 2]);
        expect(requests[1].params).toEqual(['text']);
        expect(requests[2].params).toEqual([[1, 2, 3]]);
        expect(requests[3].params).toEqual([]);
    });

    test('.notice() は id なしで送信される', async () => {
        const { client, requests } = stubClient(() => ({}));

        client.rpc.logging.write.notice({ message: 'hi' });
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('logging.write');
        expect(requests[0].id).toBeUndefined();
        expect(requests[0].params).toEqual({ message: 'hi' });
    });

    test('エラーレスポンスは JsonRpcException として throw される', async () => {
        const { client } = stubClient(({ id }) => ({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: 'Method not found' },
        }));

        await expect(client.rpc.no.such.method()).rejects.toBeInstanceOf(
            MethodNotFound,
        );
    });

    test('スキーマ値を渡した場合は従来どおり実行時検証つきで動作する (後方互換)', async () => {
        const requests: JsonRpcRequest[] = [];
        const schema = {
            greet: {
                $params: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['name'],
                    properties: { name: { type: 'string' } },
                },
                $return: { type: 'string' },
            },
        } as const;
        const client = new JsonRpcClient({
            schema,
            post: async (stream) => {
                const request = JSON.parse(
                    await readAll(stream),
                ) as JsonRpcRequest;
                requests.push(request);
                return streamOf(
                    JSON.stringify({
                        jsonrpc: '2.0',
                        id: request.id,
                        result: 'hello',
                    }),
                );
            },
        });

        await expect(client.rpc.greet({ name: 'world' })).resolves.toBe(
            'hello',
        );
        expect(requests[0].method).toBe('greet');
        expect(requests[0].params).toEqual({ name: 'world' });
        // スキーマ走査 Proxy なので未定義キーは undefined (パスビルダにならない)
        expect((client.rpc as any).unknownNamespace).toBeUndefined();
    });
});
